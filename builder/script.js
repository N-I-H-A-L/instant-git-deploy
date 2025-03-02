import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import mime from "mime-types";
import { fileURLToPath } from "url";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    }
});

// PROJECT_ID should be specified in the container execution command
const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
    console.log("Executing script");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Go to output folder (all the source code will be present in "output" folder as specified in main.sh)
    const outDirPath = path.join(__dirname, "output");

    // Go to output dir and install and build the files
    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    //Console log the output of the process
    p.stdout.on("data", (data) => {
        console.log(data.toString())
    });

    // Listen for errors
    p.stdout.on("error", (data) => {
        console.log("Error ", data.toString())
    });

    // When process gets finished
    p.on("close", async () => {
        console.log("Build completed");
        // The build files will be present in "output/dist" folder
        const distFolderPath = path.join(__dirname, "output", "dist");

        // Read the contents of the folder, recursive true means it will go keep going inside directories
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

        // Loop over the file paths
        for(const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);

            // If path is of a directory continue. Since inside the dist folder there can be directories like "assets" which contains media files.
            if(fs.lstatSync(filePath).isDirectory()) continue;

            console.log("uploading ", filePath);

            const command = new PutObjectCommand({
                //bucket name
                Bucket: process.env.AWS_BUCKET_NAME,
                //Path in the bucket where to store the file
                Key: `__outputs/${PROJECT_ID}/${path.relative(distFolderPath, filePath)}`,
                //actual content of the file
                Body: fs.createReadStream(filePath),
                //Dynamically get content type of file
                ContentType: mime.lookup(filePath),
            });

            //Send the command we created
            await s3Client.send(command);
            console.log("uploaded ", filePath);
        }

        console.log("Done...");
    });
}

init();