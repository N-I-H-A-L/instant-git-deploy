import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { fileURLToPath } from "url";
import Redis from "ioredis";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const redisClient = new Redis(process.env.REDIS);

let builtSuccessfully = false;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const STATUS_CHANNEL = "status";
const LOGS_CHANNEL = "logs";

async function publishMessage(message, channel) {
  if (channel === STATUS_CHANNEL) {
    const payload = {
      status: message,
      deploymentId: DEPLOYMENT_ID,
    };

    await redisClient.publish(channel, JSON.stringify(payload));
  } else await redisClient.publish(channel, message);
}

async function handleBuildStatus() {
  try {
    if (builtSuccessfully) {
      await publishMessage("LIVE", STATUS_CHANNEL);
    } else {
      await publishMessage("FAILED", STATUS_CHANNEL);
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
  await publishMessage("Build started...", LOGS_CHANNEL);
  await publishMessage("QUEUED", STATUS_CHANNEL);

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
    await publishMessage(getLog, LOGS_CHANNEL);
  });

  // Listen for errors
  p.stderr.on("error", async (data) => {
    const getLog = data.toString();
    console.log("Error: ", getLog);
    await publishMessage(`Error: ${getLog}`, LOGS_CHANNEL);
  });

  p.on("error", async (err) => {
    console.log("Build process encountered an error: ", err);
    await publishMessage(
      `Build process encountered an error, ${err}`,
      LOGS_CHANNEL
    );

    // Mark build as failed
    builtSuccessfully = false;

    // Ensure status update
    await handleBuildStatus();
    await redisClient.quit();
    process.exit(1);
  });

  // When process gets finished
  p.on("close", async () => {
    console.log("Starting to upload...");
    await publishMessage("Starting to upload...", LOGS_CHANNEL);

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
        await publishMessage(`uploading ${filePath}`, LOGS_CHANNEL);

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
        await publishMessage(`uploaded ${filePath}`, LOGS_CHANNEL);
      }
    } catch (err) {
      console.log("Error during S3 upload: ", err);
      await publishMessage(
        `Error during S3 upload: ${err.message}`,
        LOGS_CHANNEL
      );
      errorOccurred = true;
    }

    if (errorOccurred) {
      console.log("Build Failed!");
      await publishMessage("Build Failed!", LOGS_CHANNEL);
    } else {
      console.log("Done...");
      await publishMessage("Done...", LOGS_CHANNEL);
      builtSuccessfully = true;
    }

    await handleBuildStatus();
    await redisClient.quit();

    //To terminate the container
    process.exit(0);
  });
}

init();
