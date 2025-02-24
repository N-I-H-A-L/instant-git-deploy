import { exec } from "child_process";
import path from "path";

async function init() {
    console.log("Executing script");

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
    p.on("close", () => {
        console.log("Build completed");
    });
}