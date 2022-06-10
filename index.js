const { createWriteStream } = require("fs")
	, { readdir, mkdir } = require("fs").promises
	, { join, parse } = require("path")
	, args = require("args")
	, ffs = require("fast-folder-size/sync")
	, ProgressBar = require("progress")
	, regedit = require("regedit").promisified
	, zip = require("archiver");

let FLAGS;
let STEAM_INSTALL_PATH;
let STEAM_APPS_PATH;
let VRISING_SERVER_PATH;

(async function main()
{
	await getImportantPaths();

	args.option("output", "The file path that the final ZIP should be saved to.", join(process.cwd(), "output", "VRisingServerData.zip"))
		.option("tooldir", "The directory where the V Rising Server tool is installed.", VRISING_SERVER_PATH || "./");

	FLAGS = args.parse(process.argv);

	if (STEAM_INSTALL_PATH != null && (await readdir(STEAM_APPS_PATH)).indexOf("VRisingDedicatedServer") === -1)
		throw new Error("'VRisingDedicatedServer' Directory not found. Are you sure the V Rising Server Tool is installed?");

	if (FLAGS.tooldir != null)
		VRISING_SERVER_PATH = FLAGS.tooldir;

	if (VRISING_SERVER_PATH == null)
		throw new Error("'VRisingDedicatedServer' Directory not found. Are you sure the V Rising Server Tool is installed?");

	// Get all files in
	zipImportantFiles(VRISING_SERVER_PATH)
		.then(console.log)
		.catch(console.error);
})();

async function getImportantPaths()
{
	try
	{
		STEAM_INSTALL_PATH = Object.values(await regedit.list("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam"))[0].values["InstallPath"].value;
		STEAM_APPS_PATH = join(STEAM_INSTALL_PATH, "steamapps", "common");
		VRISING_SERVER_PATH = join(STEAM_APPS_PATH, "VRisingDedicatedServer");
	}

	catch (error)
	{
		// 'STEAM_INSTALL_PATH' couldn't be found
		// Ignore now and check later to make sure that custom args exist
	}

	return { STEAM_INSTALL_PATH, STEAM_APPS_PATH, VRISING_SERVER_PATH };
}

function zipImportantFiles(dirname)
{
	return new Promise(async (resolve, reject) =>
	{
		// Check to ensure that directory is actually the Server Tool
		if ((await readdir(join(dirname))).indexOf("VRisingServer.exe") === -1)
			return reject(new Error("Please specify the location of the V Rising Server Tool directory with the --tooldir arg."));

		const { dir, base } = parse(FLAGS.output);

		// Ensure output directory exists
		try
		{
			await mkdir(dir, { recursive: true });
		}

		catch (err)
		{
			return reject(err);
		}

		// create a file to stream archive data to.
		const output = createWriteStream(join(dir, base));
		const archive = zip("zip");

		// listen for all archive data to be written
		// "close" event is fired only when a file descriptor is involved
		output.on("close", function()
		{
			resolve(`'${base}' was saved to '${dir}'.`);
		});

		// This event is fired when the data source is drained no matter what was the data source.
		// It is not part of this library but rather from the NodeJS Stream API.
		// @see: https://nodejs.org/api/stream.html#stream_event_end
		output.on("end", () => console.log("Data has been drained"));

		// good practice to catch warnings (ie stat failures and other non-blocking errors)
		archive.on("warning", function(err)
		{
		  if (err.code === "ENOENT") {
		    // log warning
		  } else {
		    // throw error
		    reject(err);
		  }
		});

		const totalBytes = ffs(join(dirname, "save-data", "Saves"));
		const bar = new ProgressBar("Progress: [:bar] :percent (Remaining: :etas)", {
			total: totalBytes,
			complete: "=",
			incomplete: " ",
			width: 50
		});

		archive.on("progress", ({ fs }) =>
		{
			const percent = fs.processedBytes / totalBytes;
			bar.update(percent);
		});

		// good practice to catch this error explicitly
		archive.on("error", reject);

		// pipe archive data to the file
		archive.pipe(output);

		// include "run.bat" if it exists
		archive.file(join(dirname, "run.bat"), { name: "run.bat" });

		// include Server Settings dir
		archive.directory(join(dirname, "VRisingServer_Data", "StreamingAssets", "Settings"), "VRisingServer_Data/StreamingAssets/Settings");

		// include Save Data dir
		archive.directory(join(dirname, "save-data", "Saves"), "save-data/Saves");

		// finalize the archive (ie we are done appending files but streams have to finish yet)
		// "close", "end" or "finish" may be fired right after calling this method so register to them beforehand
		archive.finalize();
	});
}
