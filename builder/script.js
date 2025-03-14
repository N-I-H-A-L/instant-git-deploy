import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { fileURLToPath } from "url";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

let builtSuccessfully = false;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;

async function publishLog(log) {}

async function handleBuildStatus() {
  try {
    if (builtSuccessfully) {
      await publishLog("Build status: LIVE");
    } else {
      await publishLog("Build status: FAILED");
    }
    console.log(
      `Build status updated to ${builtSuccessfully ? "LIVE" : "FAILED"}`
    );
  } catch (error) {
    console.log("Error updating deployment status", error);
  }
}

async function init() {
  console.log("Executing script");
  await publishLog("Build started...");

  await publishLog("Build status: QUEUED");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Go to output folder (all the source code will be present in "output" folder as specified in main.sh)
  const outDirPath = path.join(__dirname, "output");

  // Go to output dir and install and build the files
  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  //Console log the output of the process
  p.stdout.on("data", async (data) => {
    const getLog = data.toString();
    console.log(getLog);
    await publishLog(getLog);
  });

  // Listen for errors
  p.stdout.on("error", async (data) => {
    const getLog = data.toString();
    console.log("Error: ", getLog);
    await publishLog("Error: ", getLog);
  });

  p.on("error", async (err) => {
    console.log("Build process encountered an error: ", err);
    await publishLog(`Build process encountered an error, ${err}`);

    // Mark build as failed
    builtSuccessfully = false;

    // Ensure status update
    await handleBuildStatus();

    process.exit(1);
  });

  // When process gets finished
  p.on("close", async () => {
    console.log("Starting to upload...");
    await publishLog("Starting to upload...");

    let errorOccurred = false;

    try {
      // The build files will be present in "output/dist" folder
      const distFolderPath = path.join(__dirname, "output", "dist");

      // Read the contents of the folder, recursive true means it will go keep going inside directories
      const distFolderContents = fs.readdirSync(distFolderPath, {
        recursive: true,
      });

      // Loop over the file paths
      for (const file of distFolderContents) {
        const filePath = path.join(distFolderPath, file);

        // If path is of a directory continue. Since inside the dist folder there can be directories like "assets" which contains media files.
        if (fs.lstatSync(filePath).isDirectory()) continue;

        console.log("uploading ", filePath);
        await publishLog(`uploading ${filePath}`);

        const command = new PutObjectCommand({
          //bucket name
          Bucket: process.env.AWS_BUCKET_NAME,
          //Path in the bucket where to store the file
          Key: `__outputs/${DEPLOYMENT_ID}/${file}`,
          //actual content of the file
          Body: fs.createReadStream(filePath),
          //Dynamically get content type of file
          ContentType: mime.lookup(filePath),
        });

        //Send the command we created
        await s3Client.send(command);
        console.log("uploaded ", filePath);
        await publishLog(`uploaded ${filePath}`);
      }
    } catch (err) {
      console.log("Error during building the application: ", err);
      errorOccurred = true;
    }

    if (errorOccurred) {
      console.log("Build Failed!");
      await publishLog("Build Failed!");
    } else {
      console.log("Done...");
      await publishLog("Done...");
      builtSuccessfully = true;
    }
    await handleBuildStatus();

    //To terminate the container
    process.exit(0);
  });
}

init();
