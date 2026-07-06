/// @ts-check
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };

const GROUP_ID = "org.jahia.community";
const STAGING = "dist/jar";

// Wipe and recreate staging directory
rmSync(STAGING, { recursive: true, force: true });
mkdirSync(`${STAGING}/META-INF/maven/${GROUP_ID}/${pkg.name}`, { recursive: true });

// pom.properties — lets Maven/Nexus identify the artifact without a pom.xml
writeFileSync(
  `${STAGING}/META-INF/maven/${GROUP_ID}/${pkg.name}/pom.properties`,
  `version=${pkg.version}\ngroupId=${GROUP_ID}\nartifactId=${pkg.name}\n`,
);

// pom.xml — required by Nexus when the Jahia Store re-publishes the artifact
writeFileSync(
  `${STAGING}/META-INF/maven/${GROUP_ID}/${pkg.name}/pom.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>${GROUP_ID}</groupId>
  <artifactId>${pkg.name}</artifactId>
  <version>${pkg.version}</version>
  <packaging>bundle</packaging>
  <parent>
    <artifactId>jahia-modules</artifactId>
    <groupId>org.jahia.modules</groupId>
    <version>8.2.3.0</version>
  </parent>
</project>
`,
);

// Copy module content
cpSync("javascript", `${STAGING}/javascript`, { recursive: true });

// MANIFEST.MF — written outside the staging dir and passed via --manifest
writeFileSync(
  "dist/MANIFEST.MF",
  `Manifest-Version: 1.0
Bundle-Category: jahia-module
Bundle-Description: ${pkg.description}
Bundle-ManifestVersion: 2
Bundle-Name: ${pkg.name}
Bundle-SymbolicName: ${pkg.name}
Bundle-Version: ${pkg.version.replace(/^(\d+\.\d+\.\d+)-(.+)$/, "$1.$2")}
Implementation-Title: ${pkg.name}
Implementation-URL: http://github.com/Jahia/happy-paste
Implementation-Version: ${pkg.version}
Jahia-Module-Type: system
Jahia-Required-Version: 8.2.3.0
Jahia-GroupId: ${GROUP_ID}
Jahia-Depends: richtext-ckeditor5=1.0.1
Jahia-Source-Control-Connection: http://github.com/Jahia/happy-paste
Jahia-Static-Resources: /javascript
`,
);

// Create the JAR
const jarFile = resolve(`dist/${pkg.name}-${pkg.version}.jar`);
const result = spawnSync(
  "jar",
  ["--create", `--file=${jarFile}`, "--manifest=dist/MANIFEST.MF", "-C", STAGING, "."],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
