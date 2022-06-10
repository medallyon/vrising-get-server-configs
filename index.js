const { createWriteStream } = require("fs")
	, { readdir } = require("fs").promises
	, { join } = require("path")
	, regedit = require("regedit").promisified
	, zip = require("archiver");

(async function main()
{
	const STEAM_INSTALL_PATH = Object.values(await regedit.list("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam"))[0].values["InstallPath"].value;
	const STEAM_APPS_PATH = join(STEAM_INSTALL_PATH, "steamapps", "common");
	const VRISING_SERVER_PATH = join(STEAM_APPS_PATH, "VRisingDedicatedServer");

	if ((await readdir(STEAM_APPS_PATH)).indexOf("VRisingDedicatedServer") === -1)
		throw new Error("'VRisingDedicatedServer' Directory not found. Are you sure the V Rising Server Tool is installed?");

	// Get all files in
	console.log(await zipImportantFiles(VRISING_SERVER_PATH));
})();

function zipImportantFiles(dirname)
{
	return new Promise(async (resolve, reject) =>
	{
		// create a file to stream archive data to.
		const output = createWriteStream(join(process.cwd(), "VRisingServerData.zip"));
		const archive = zip("zip");

		// listen for all archive data to be written
		// "close" event is fired only when a file descriptor is involved
		output.on("close", function() {
		  console.log(archive.pointer() + " total bytes");
		  console.log("archiver has been finalized and the output file descriptor has closed.");
		});

		// This event is fired when the data source is drained no matter what was the data source.
		// It is not part of this library but rather from the NodeJS Stream API.
		// @see: https://nodejs.org/api/stream.html#stream_event_end
		output.on("end", function() {
		  console.log("Data has been drained");
		  resolve(join(process.cwd(), "VRisingServerData.zip"));
		});

		// good practice to catch warnings (ie stat failures and other non-blocking errors)
		archive.on("warning", function(err) {
		  if (err.code === "ENOENT") {
		    // log warning
		  } else {
		    // throw error
		    throw err;
		  }
		});

		// good practice to catch this error explicitly
		archive.on("error", function(err) {
			reject(err);
			throw err;
		});

		// pipe archive data to the file
		archive.pipe(output);

		// include 'run.bat' if it exists
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
