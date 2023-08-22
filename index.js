/* Main application logic */

const childProcess = require("child_process");
const fs = require("fs");

const core = require("@actions/core");

try {
    // Check to make sure the requested Tomcat/Java version exists in our GitHub Container Registry
    const inputs = getActionInputs();
    verifyTomcatImage(inputs);

    // Create a custom start script if the user provided ep files.
    let useCustomStartupScript = false;
    if (inputs.epFiles.length) {
        generateCustomStartupScript(inputs);
        useCustomStartupScript = true;
    }

    // Create our Dockerfile in a temporary folder
    let temporaryFolder = `/tmp/${getNowString()}`;
    if (!fs.existsSync(temporaryFolder))
        fs.mkdirSync(temporaryFolder);
    let temporaryDockerfile = `${temporaryFolder}/Dockerfile`;
    generateTemporaryDockerfile(temporaryDockerfile, inputs, useCustomStartupScript);

    let generatedImageTag = buildDockerImage(temporaryDockerfile, inputs);
    pushDockerImage(generatedImageTag);
} catch (e) {
    core.setFailed(e.message);
}

function getActionInputs() {
    // Retrieve and verify the contents of all of our inputs

    // Required inputs
    const tomcatVersion = core.getInput("tomcat-version"),
          javaVersion = core.getInput("java-version"),
          warFile = core.getInput("war-file"),
          tomcatVersionFormat = /^[0-9]+$/,
          javaVersionFormat = /^[0-9]+$/,
          warFilePath = `${process.env.GITHUB_WORKSPACE}/${warFile}`;

    if (!tomcatVersionFormat.test(tomcatVersion)) {
        core.setFailed(`Invalid Tomcat version: ${tomcatVersion}`);
        process.exit();
    }

    if (!javaVersionFormat.test(javaVersion)) {
        core.setFailed(`Invalid Java version: ${javaVersion}`);
        process.exit();
    }

    if (!fs.existsSync(warFilePath)) {
        core.setFailed(`WAR file "${warFile}" not found.`);
        process.exit();
    } else if (!fs.statSync(warFilePath).isFile()) {
        core.setFailed(`WAR file "${warFile}" is not a file.`);
        process.exit();
    }

    // Optional inputs
    const tomcatExtrasFolder = core.getInput("tomcat-extras-folder"),
          tomcatExtrasFolderPath = `${process.env.GITHUB_WORKSPACE}/${tomcatExtrasFolder}`,
          portsRaw = core.getInput("ports"),
          timezone = core.getInput("timezone");
    let ports = [],
        epFiles = [],
        imageName = core.getInput("image-name"),
        tagName = core.getInput("tag-name");
    if (!~[null, undefined, ""].indexOf(tomcatExtrasFolder)) {
        if (!fs.existsSync(tomcatExtrasFolderPath)) {
            core.setFailed(`Tomcat extras folder "${tomcatExtrasFolder}" not found.`);
            process.exit();
        } else if (!fs.statSync(tomcatExtrasFolderPath).isDirectory()) {
            core.setFailed(`Tomcat extras folder "${tomcatExtrasFolder}" is not a directory.`);
            process.exit();
        }
    }

    if (!~[null, undefined, ""].indexOf(portsRaw)) {
        let tempPorts = portsRaw.split(",").map((port) => port.trim()),
            portFormat = /^[0-9]+$/;
        tempPorts.forEach((port) => {
            if (!portFormat.test(port) || isNaN(port)) {
                core.setFailed(`Invalid port number: ${port}`);
                process.exit();
            }
        });
        ports = tempPorts.map((port) => parseInt(port, 10));
    }

    if (!~[null, undefined, ""].indexOf(core.getInput("ep-files")))
        epFiles = core.getMultilineInput("ep-files");

    if (~[null, undefined, ""].indexOf(imageName)) {
        // Default the image name to the repository owner/repository name (ex. "octocat/hello-world") in GitHub Container Registry.
        imageName = `ghcr.io/${process.env.GITHUB_REPOSITORY}`;
    }

    if (~[null, undefined, ""].indexOf(tagName)) {
        let githubRef = process.env.GITHUB_REF,
            branchFormat = /^refs\/heads\/(.*)$/,
            prFormat = /^refs\/pull\/([^/]+)\/merge$/,
            tagFormat = /^refs\/tags\/(.*)$/;
        if (branchFormat.test(githubRef)) {
            tagName = branchFormat.exec(githubRef)[1];
        } else if (prFormat.test(githubRef)) {
            tagName = prFormat.exec(githubRef)[1];
        } else if (tagFormat.test(githubRef)) {
            tagName = tagFormat.exec(githubRef)[1];
        } else {
            // Use the current date-time if we don't have a reliable ref to go on.
            tagName = getNowString();
        }
    }

    return {
        tomcatVersion,
        javaVersion,
        warFile,
        tomcatExtrasFolder,
        ports,
        timezone,
        epFiles,
        imageName,
        tagName
    }
}

function getNowString() {
    let now = new Date(),
        year = now.getFullYear(),
        month = now.getMonth() + 1,
        day = now.getDate(),
        hour = now.getHours(),
        minute = now.getMinutes(),
        second = now.getSeconds(),
        monthString = month < 10 ? `0${month}` : month,
        dayString = day < 10 ? `0${day}` : day,
        hourString = hour < 10 ? `0${hour}` : hour,
        minuteString = minute < 10 ? `0${minute}` : minute,
        secondString = second < 10 ? `0${second}` : second;
    return `${year}-${monthString}-${dayString}_${hourString}-${minuteString}-${secondString}`;
}

function verifyTomcatImage(inputs) {
    core.info(`Checking for existence of Tomcat image for Tomcat version: ${inputs.tomcatVersion} and Java version: ${inputs.javaVersion}`);

    const tomcatImageName = `${inputs.tomcatVersion}-java${inputs.javaVersion}`,
          inspectManifestProcess = childProcess.spawnSync(
              "docker",
              ["manifest", "inspect", `ghcr.io/itechpros/tomcat:${tomcatImageName}`],
              { encoding: "utf-8" }
          );
    if (~[null, 1].indexOf(inspectManifestProcess.status)) {
        // Manifest inspect failed (we don't have that version), so let's output what the command output was and set the failure.
        core.info(`Docker return code: ${inspectManifestProcess.status}`);
        core.info(`Docker stdout: ${inspectManifestProcess.stdout}`);
        core.info(`Docker stderr: ${inspectManifestProcess.stderr}`);
        core.setFailed(`Tomcat version not found: ${tomcatImageName}`);
        process.exit();
    }
}

function generateCustomStartupScript(inputs) {
    let customStartupScriptPath = `${process.env.GITHUB_WORKSPACE}/custom_tomcat_start.sh`,
        startupScriptContentArray = [
            "#!/bin/bash",
            "",
            'echo "Filling templates with environmental variables"'
        ];
    startupScriptContentArray = startupScriptContentArray.concat(inputs.epFiles.map((epFile) => `ep /usr/share/tomcat/${epFile}`));
    startupScriptContentArray = startupScriptContentArray.concat([
        "",
        'echo "Starting Tomcat"',
        "/usr/share/tomcat/bin/catalina.sh run"
    ]);

    let startupScriptContent = startupScriptContentArray.join("\n");
    core.info("Startup script content:\n" + startupScriptContent);
    fs.writeFileSync(customStartupScriptPath, startupScriptContent);

    return customStartupScriptPath;
}

function generateTemporaryDockerfile(tempDockerfilePath, inputs, useCustomStartupScript) {
    let dockerfileContentsArray = [
        `FROM ghcr.io/itechpros/tomcat:${inputs.tomcatVersion}-java${inputs.javaVersion}`
    ];

    if (!~[null, undefined, ""].indexOf(inputs.timezone)) {
        dockerfileContentsArray = dockerfileContentsArray.concat([
            `ENV TIME_ZONE ${inputs.timezone}`,
            `RUN ln -snf /usr/share/zoneinfo/$TIME_ZONE /etc/localtime && echo $TIME_ZONE > /etc/timezone`
        ]);
    }

    dockerfileContentsArray.push(`COPY ${inputs.warFile} /usr/share/tomcat/webapps/`);
    
    if (!~[null, undefined, ""].indexOf(inputs.tomcatExtrasFolder))
        dockerfileContentsArray.push(`COPY ${inputs.tomcatExtrasFolder}/ /usr/share/tomcat/`);

    if (useCustomStartupScript)
        dockerfileContentsArray.push("COPY custom_tomcat_start.sh /usr/share/tomcat/tomcat_start.sh");

    inputs.ports.forEach((port) => {
        dockerfileContentsArray.push(`EXPOSE ${port}`);
    });

    if (useCustomStartupScript)
        dockerfileContentsArray.push('CMD ["/usr/share/tomcat/tomcat_start.sh"]');

    let dockerfileContents = dockerfileContentsArray.join("\n");
    core.info(`Dockerfile contents:\n${dockerfileContents}`);
    fs.writeFileSync(tempDockerfilePath, dockerfileContents);
}

function buildDockerImage(temporaryDockerfile, inputs) {
    core.info("Building custom Tomcat Docker image");
    const builtImageName = `${inputs.imageName}:${inputs.tagName}`,
          buildProcess = childProcess.spawnSync(
            'docker',
            [
                'build',
                '-t', builtImageName,
                '-f', temporaryDockerfile,
                '.'
            ],
            {
                cwd: process.env.GITHUB_WORKSPACE,
                stdio: 'inherit'
            }
        );
    if (buildProcess.status === null || buildProcess.status !== 0) {
        core.setFailed("Building of custom Tomcat image failed");
        process.exit();
    }
    return builtImageName;
}

function pushDockerImage(imageTag) {
    core.info("Pushing custom Tomcat Docker image");
    const pushProcess = childProcess.spawnSync(
        'docker',
        [
            'push',
            imageTag
        ],
        {
            stdio: 'inherit'
        }
    );
    if (pushProcess.status === null || pushProcess.status !== 0) {
        core.setFailed("Pushing of custom Tomcat image failed");
        process.exit();
    }
}