# servoy-tomcat-builder

This [GitHub Action](https://github.com/features/actions) allows users to create Tomcat Docker images that come bundled with a WAR built from our [Servoy WAR Builder](https://github.com/itechpros/servoy-war-builder) action.

See the [LICENSE](LICENSE.md) for more information on the dual licensing for commercial projects.

## Examples

**Note:** We rely on the [Docker Login action](https://github.com/docker/login-action) to authenticate with whichever Docker container registry you would like to use. We only list some of the ways you can login and upload your images below, but any of the services listed in the Docker Login action should function properly with this action.

### Upload to GitHub Container Registry
```yaml
name: Servoy WAR Build & Tomcat GHCR
on: push
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
     - name: Checkout                            # Checkout the repo
       uses: actions/checkout@v2
     - name: Docker Login                        # Login to the GitHub Container Registry
       uses: docker/login-action@v3
       with:
         registry: ghcr.io
         username: ${{ github.actor }}
         password: ${{ secrets.GITHUB_TOKEN }}
     - name: Servoy WAR Build                    # Build our WAR file
       uses: itechpros/servoy-war-builder@v1
       with:
         servoy-version: 2023.03.2.3844
         # ...
         war-file-name: MySolution.war
     - name: Build and upload Tomcat image       # Generate and push a Docker image that contains our generated WAR file to the GitHub Container Registry
       uses: itechpros/servoy-tomcat-builder@v1
       with:
         tomcat-version: 10
         java-version: 11
         war-file: MySolution.war
```

### Upload to Docker Hub
```yaml
name: Servoy WAR Build & Tomcat Docker Hub
on: push
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
     - name: Checkout                            # Checkout the repo
       uses: actions/checkout@v2
     - name: Docker Login                        # Login to Docker Hub
       uses: docker/login-action@v3
       with:
         username: ${{ secrets.DOCKERHUB_USERNAME }}
         password: ${{ secrets.DOCKERHUB_TOKEN }}
     - name: Servoy WAR Build                    # Build our WAR file
       uses: itechpros/servoy-war-builder@v1
       with:
         servoy-version: 2023.03.2.3844
         # ...
         war-file-name: MySolution.war
     - name: Build and upload Tomcat image       # Generate and push a Docker image that contains our generated WAR file to Docker Hub
       uses: itechpros/servoy-tomcat-builder@v1
       with:
         tomcat-version: 10
         java-version: 11
         war-file: MySolution.war
         image-name: myorg/myrepo                # Image name in a Docker Hub-friendly format
```

### Upload to Amazon ECR
```yaml
name: Servoy WAR Build & Tomcat Amazon ECR
on: push
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
     - name: Checkout                                   # Checkout the repo
       uses: actions/checkout@v2
     - name: Docker Login                               # Login to your AWS ECR
       uses: docker/login-action@v3
       with:
         registry: <aws-account-number>.dkr.ecr.<region>.amazonaws.com
         username: ${{ secrets.AWS_ACCESS_KEY_ID }}
         password: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
     - name: Servoy WAR Build                           # Build our WAR file
       uses: itechpros/servoy-war-builder@v1
       with:
         servoy-version: 2023.03.2.3844
         # ...
         war-file-name: MySolution.war
     - name: Build and upload Tomcat image              # Generate and push a Docker image that contains our generated WAR file to the AWS ECR
       uses: itechpros/servoy-tomcat-builder@v1
       with:
         tomcat-version: 10
         java-version: 11
         war-file: MySolution.war
         image-name: <aws-account-number>.dkr.ecr.<region>.amazonaws.com/hello-world  # Image name in a AWS ECR-friendly format
```

### Upload to Azure Container Registry
```yaml
name: Servoy WAR Build & Tomcat Azure CR
on: push
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
     - name: Checkout                                   # Checkout the repo
       uses: actions/checkout@v2
     - name: Docker Login                               # Login to your Azure Container Registry
       uses: docker/login-action@v3
       with:
         registry: <registry-name>.azurecr.io
         username: ${{ secrets.AZURE_CLIENT_ID }}
         password: ${{ secrets.AZURE_CLIENT_SECRET }}
     - name: Servoy WAR Build                           # Build our WAR file
       uses: itechpros/servoy-war-builder@v1
       with:
         servoy-version: 2023.03.2.3844
         # ...
         war-file-name: MySolution.war
     - name: Build and upload Tomcat image              # Generate and push a Docker image that contains our generated WAR file to the Azure CR
       uses: itechpros/servoy-tomcat-builder@v1
       with:
         tomcat-version: 10
         java-version: 11
         war-file: MySolution.war
         image-name: <registry-name>.azurecr.io/myrepo  # Image name in a Azure Container Registry-friendly format
```


### Upload to DigitalOcean Container Registry
```yaml
name: Servoy WAR Build & Tomcat DigitalOcean
on: push
jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
     - name: Checkout                                   # Checkout the repo
       uses: actions/checkout@v2
     - name: Docker Login                               # Login to your Digital Ocean Registry
       uses: docker/login-action@v3
       with:
         registry: registry.digitalocean.com
         username: ${{ secrets.DIGITALOCEAN_TOKEN }}
         password: ${{ secrets.DIGITALOCEAN_TOKEN }}
     - name: Servoy WAR Build                           # Build our WAR file
       uses: itechpros/servoy-war-builder@v1
       with:
         servoy-version: 2023.03.2.3844
         # ...
         war-file-name: MySolution.war
     - name: Build and upload Tomcat image              # Generate and push a Docker image that contains our generated WAR file to DigitalOcean
       uses: itechpros/servoy-tomcat-builder@v1
       with:
         tomcat-version: 10
         java-version: 11
         war-file: MySolution.war
         image-name: registry.digitalocean.com/myorg/myrepo  # Image name in a DigitalOcean-friendly format
```

## Options

- ***tomcat-version*** 🔴 *required*  
  Version of Tomcat to use in your Docker image. Supported options are: `8`, `9`, or `10`.  
  **Note:** Our Tomcat images are updated monthly with operating system updates as well as the latest minor & patch version of the provided Tomcat version.
- ***java-version*** 🔴 *required*  
  Version of Java to use in your Docker image. Supported versions are: `8`, or `11`.  
  **Note:** Tomcat 10 only supports Java 11.
- ***war-file***  🔴 *required*  
  Path and name of the WAR file to be included in the Docker image. Path should be relative to the root directory of your GitHub repository.  
  **Examples:**
  ```yaml
  with:
    # ...
    war-file: MySolution.war      # Use the MySolution.war file in the root directory of the repository
    war-file: bin/MySolution.war  # Use the MySolution.war file in the "bin" directory of the repository
  ```
- ***tomcat-extras-folder***  
  Path of the directory that contains files and folders that should be overlayed on top of the existing Tomcat install. This allows you to overwrite files such as `conf/server.xml`, `conf/tomcat-users.xml`, `conf/web.xml`, add any JARs via the `lib` folder, etc.  
  **Examples:**  
  ```yaml
  with:
    # ...
    tomcat-extras-folder: my_tomcat_extras  # Overlay the contents of the my_tomcat_extras folder on top of the existing Tomcat install in the Docker image
  ```
- ***ports***  
  Comma-delimited list of ports that should be exposed in the Docker image (default: 8080). Note that changing this value requires a change to the port number in the `conf/server.xml` file.  
  **Examples:**  
  ```yaml
  with:
    # ...
    ports: 80, 443, 8080  # Allow external connections into the Docker container on ports 80, 443, and 8080.
  ```
- ***timezone***  
  Update the timezone that the operating system uses.  
  **Examples:**
  ```yaml
  with:
    # ...
    timezone: America/New_York  # Run the operating system on New York time (EST/EDT)
    timezone: UTC               # Run the operating system on UTC time
  ```
- ***ep-files***  
  Path of files relative to the Tomcat install directory that should be ran through [envplate](https://github.com/kreuzwerker/envplate) on server startup.  
  **Examples:**  
  ```yaml
  with:
    # ...
    ep-files: |
      conf/server.xml
      conf/tomcat-users.xml
      conf/web.xml
  ```
- ***image-name***  
  Name of the Docker image. Defaults to the [GitHub Container Registry (GHCR)](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) using the user/organization and repository name. For example, if your GitHub repository was `octocat/hello-world`, the image name would default to `ghcr.io/octocat/hello-world`.  
  **Examples:**  
  ```yaml
  with:
    # ...
    image-name: ghcr.io/octocat/hello-world                                  # Build for GitHub Container Registry (GHCR.IO)
    image-name: octocat/hello-world                                          # Build for Docker Hub
    image-name: <aws_account_id>.dkr.ecr.<region>.amazonaws.com/hello-world  # Build for Amazon ECR
    image-name: <registry>.azurecr.io/hello-world                            # Build for Azure Container Registry
  ```
- ***tag-name***  
  Name of the tag (version) to use with the Docker image.  
  If not specified, the action will look at the most recent commit at the time the build was created and look for `[tag-name=mytag123]` in the commit message. If the text is found, it uses the value between the equal sign (=) and the right bracket (]), in this case, `mytag123` and uses it as the Docker tag name.  
  If no tag name was specified in the latest commmit message, it uses the current timestamp in `yyyy-MM-dd_HH-mm-ss` format.  
  **Examples:**
  ```yaml
  with:
    # ...
    tag-name: latest             # Use 'latest' as the Docker image tag
    tag-name: ${{ github.ref }}  # Use the current branch/Git tag/pull request number as the Docker tag
  ```