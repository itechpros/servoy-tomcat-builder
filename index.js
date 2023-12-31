/* Main application logic */

const childProcess = require("child_process");
const fs = require("fs");

const core = require("@actions/core");
const github = require("@actions/github");

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
          baseImage = core.getInput("base-image"),
          warFile = core.getInput("war-file"),
          tomcatVersionFormat = /^[0-9]+$/,
          javaVersionFormat = /^[0-9]+$/,
          warFilePath = `${process.env.GITHUB_WORKSPACE}/${warFile}`;

    if (isSet(tomcatVersion) && isSet(javaVersion)) {
        if (!tomcatVersionFormat.test(tomcatVersion)) {
            core.setFailed(`Invalid Tomcat version: ${tomcatVersion}`);
            process.exit();
        }

        if (!javaVersionFormat.test(javaVersion)) {
            core.setFailed(`Invalid Java version: ${javaVersion}`);
            process.exit();
        }
    }

    if (isSet(baseImage) && isSet(tomcatVersion)) {
        core.setFailed("base-image and tomcat-version cannot be set at the same time.");
        process.exit();
    } else if (isSet(baseImage) && isSet(javaVersion)) {
        core.setFailed("base-image and java-version cannot be set at the same time.");
        process.exit();
    } else if ((isSet(tomcatVersion) && !isSet(javaVersion)) || (!isSet(tomcatVersion) && isSet(javaVersion))) {
        core.setFailed("tomcat-version and java-version are required when not using base-image.");
        process.exit();
    } else if (!isSet(tomcatVersion) && !isSet(javaVersion) && !isSet(baseImage)) {
        core.setFailed("tomcat-version and java-version are required, or provide a base-image.");
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
    if (isSet(tomcatExtrasFolder)) {
        if (!fs.existsSync(tomcatExtrasFolderPath)) {
            core.setFailed(`Tomcat extras folder "${tomcatExtrasFolder}" not found.`);
            process.exit();
        } else if (!fs.statSync(tomcatExtrasFolderPath).isDirectory()) {
            core.setFailed(`Tomcat extras folder "${tomcatExtrasFolder}" is not a directory.`);
            process.exit();
        }
    }

    if (isSet(portsRaw)) {
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

    if (isSet(core.getInput("ep-files")))
        epFiles = core.getMultilineInput("ep-files");

    if (!isSet(imageName)) {
        // Default the image name to the repository owner/repository name (ex. "octocat/hello-world") in GitHub Container Registry.
        imageName = `ghcr.io/${process.env.GITHUB_REPOSITORY}`;
    }

    if (!isSet(tagName)) {
        // Check if they put a tag name in their most recent commit message.
        if (github.context.eventName === "push") {
            let tagNameFormat = /\[tag-name=([^\]]+)\]/gm,
                commitMessage = getMostRecentCommitMessage(),
                tagNameMatchResult = tagNameFormat.exec(commitMessage);
            if (tagNameMatchResult !== null)
                tagName = tagNameMatchResult[1];
        }

        // Use the current date-time if the user didn't provide a tag name.
        if (!isSet(tagName))
            tagName = getNowString();
    } else {
        let branchFormat = /^refs\/heads\/(.*)$/,
            prFormat = /^refs\/pull\/([^/]+)\/merge$/,
            tagFormat = /^refs\/tags\/(.*)$/,
            branchFormatResult = branchFormat.exec(tagName),
            prFormatResult = prFormat.exec(tagName),
            tagFormatResult = tagFormat.exec(tagName);
        if (branchFormatResult !== null) {
            tagName = branchFormatResult[1];
        } else if (prFormatResult !== null) {
            tagName = prFormatResult[1];
        } else if (tagFormatResult !== null) {
            tagName = tagFormatResult[1];
        }
    }

    return {
        tomcatVersion,
        javaVersion,
        baseImage,
        warFile,
        tomcatExtrasFolder,
        ports,
        timezone,
        epFiles,
        imageName,
        tagName
    }
}

function isSet(value) {
    return [null, undefined, ""].indexOf(value) === -1;
}

function getMostRecentCommitMessage() {
    let gitOutputProcess = childProcess.spawnSync(
        "git",
        [
            "log",
            "-1",
            "--pretty=%B"
        ],
        {
            cwd: process.env.GITHUB_WORKSPACE,
            encoding: "utf-8"
        }
    );

    if (gitOutputProcess.status !== 0) {
        // Can't determine latest commit, so don't return it.
        return "";
    } else {
        return gitOutputProcess.stdout;
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
    if (isSet(inputs.tomcatVersion) && isSet(inputs.javaVersion)) {
        core.info(`Checking for existence of Tomcat image for Tomcat version: ${inputs.tomcatVersion} and Java version: ${inputs.javaVersion}`);
        const tomcatImageName = `${inputs.tomcatVersion}-java${inputs.javaVersion}`;
        checkForDockerImageExistence(`ghcr.io/itechpros/tomcat:${tomcatImageName}`);
    } else if (isSet(inputs.baseImage)) {
        core.info(`Checking for existence of Docker image: ${inputs.baseImage}`);
        checkForDockerImageExistence(inputs.baseImage);
    }
}

function checkForDockerImageExistence(imageName) {
    const inspectManifestProcess = childProcess.spawnSync(
              "docker",
              ["manifest", "inspect", imageName],
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
        startupScriptContentArray = ["#!/bin/bash"];
    startupScriptContentArray = startupScriptContentArray.concat(inputs.epFiles.map((epFile) => `ep /usr/share/tomcat/${epFile}`));

    let startupScriptContent = startupScriptContentArray.join("\n");
    core.info("Startup script content:\n" + startupScriptContent);
    fs.writeFileSync(customStartupScriptPath, startupScriptContent);

    return customStartupScriptPath;
}

function generateTemporaryDockerfile(tempDockerfilePath, inputs, useCustomStartupScript) {
    let dockerfileContentsArray = [];
    if (isSet(inputs.tomcatVersion) && isSet(inputs.javaVersion)) {
        dockerfileContentsArray.push(`FROM ghcr.io/itechpros/tomcat:${inputs.tomcatVersion}-java${inputs.javaVersion}`);
    } else if (isSet(inputs.baseImage)) {
        dockerfileContentsArray.push(`FROM ${inputs.baseImage}`);
    }

    if (isSet(inputs.timezone)) {
        dockerfileContentsArray = dockerfileContentsArray.concat([
            `ENV TIME_ZONE ${inputs.timezone}`,
            `RUN ln -snf /usr/share/zoneinfo/$TIME_ZONE /etc/localtime && echo $TIME_ZONE > /etc/timezone`
        ]);
    }

    inputs.ports.forEach((port) => {
        dockerfileContentsArray.push(`EXPOSE ${port}`);
    });

    if (isSet(inputs.tomcatExtrasFolder))
        dockerfileContentsArray.push(`COPY ${inputs.tomcatExtrasFolder}/ /usr/share/tomcat/`);

    if (useCustomStartupScript) {
        dockerfileContentsArray = dockerfileContentsArray.concat([
            "COPY custom_tomcat_start.sh /usr/share/tomcat/custom_tomcat_start.sh",
            "RUN dos2unix /usr/share/tomcat/custom_tomcat_start.sh"
        ]);
    }
    
    dockerfileContentsArray.push(`COPY ${inputs.warFile} /usr/share/tomcat/webapps/`);
    
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