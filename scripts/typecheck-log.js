// =====================================================================
// קובץ מלא ומתוקן: scripts/typecheck-log.js
// =====================================================================
import { exec } from "child_process";
import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { resolve, join } from "path";

const outputDir = "script-outputs";
const outputFile = join(outputDir, "analysis_log.log");
const tsCommand = "npx tsc --noEmit --pretty false";
const eslintOutputFile = join(outputDir, "eslint-output.json");
const eslintCommand = `npx eslint . --ext ts,tsx --format json -o ${eslintOutputFile}`;

const execPromise = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        // ESLint exits with an error code for warnings/errors. This is expected.
        // The logic now checks the output file, so we can still reject on a true execution error.
        reject({ error, stdout, stderr });
        return;
      }
      resolve({ stdout, stderr });
    });
  });

async function getCodeContext(filePath, lineNumber) {
  if (!filePath || lineNumber < 1) {
    return "> No code context available.";
  }
  try {
    const fullPath = resolve(process.cwd(), filePath);
    const fileContent = await readFile(fullPath, "utf-8");
    const lines = fileContent.split(/\r?\n/);
    const contextStart = Math.max(0, lineNumber - 3);
    const contextEnd = Math.min(lines.length, lineNumber + 2);
    return lines
      .slice(contextStart, contextEnd)
      .map((lineContent, i) => {
        const currentLine = contextStart + i + 1;
        const marker = currentLine === lineNumber ? ">>" : "  ";
        return `${marker} ${currentLine
          .toString()
          .padStart(4)} | ${lineContent}`;
      })
      .join("\n");
  } catch (err) {
    return `> Error reading file for context: ${filePath}`;
  }
}

async function getTypeScriptIssues() {
  console.log("Running TypeScript check...");
  try {
    await execPromise(tsCommand);
    console.log("TypeScript check passed.");
    return [];
  } catch (executionResult) {
    console.error("TypeScript check found errors.");
    const { stdout } = executionResult;
    // Split by newline that is followed by a non-whitespace character
    const errorBlocks = stdout.trim().split(/\r?\n(?=\S)/);
    const errorRegex = /^(.+?\.tsx?)\((\d+),(\d+)\):\s+(error TS\d+:\s.*)/;

    return errorBlocks
      .map((block) => {
        const match = block.split(/\r?\n/)[0].trim().match(errorRegex);
        if (!match) return null;
        const [, filePath, line, column, message] = match;
        return {
          tool: "TypeScript",
          severity: "Error",
          filePath,
          line: parseInt(line, 10),
          column: parseInt(column, 10),
          message,
        };
      })
      .filter(Boolean); // Filter out nulls
  }
}

async function getEslintIssues() {
  console.log("Running ESLint check...");
  try {
    await execPromise(eslintCommand);
    console.log("ESLint check passed (no issues found).");
  } catch (executionResult) {
    // This is expected if ESLint finds issues. We check the output file below.
    console.log("ESLint command finished. Checking for output file.");
  }

  try {
    const fileContent = await readFile(eslintOutputFile, "utf-8");
    const issues = parseEslintJson(fileContent);
    await unlink(eslintOutputFile); // Clean up temp file
    return issues;
  } catch (e) {
    console.error(
      "Fatal: Could not read ESLint output file. There might be a configuration problem with ESLint."
    );
    return [
      {
        tool: "ESLint",
        severity: "Error",
        filePath: "N/A",
        line: 0,
        message:
          "Could not read ESLint output file. This can happen due to a fatal ESLint configuration error.",
      },
    ];
  }
}

function parseEslintJson(jsonString) {
  try {
    if (!jsonString.trim()) {
      return [];
    }
    return JSON.parse(jsonString).flatMap((file) =>
      file.messages.map((msg) => ({
        tool: "ESLint",
        severity: msg.severity === 2 ? "Error" : "Warning",
        filePath: file.filePath,
        line: msg.line,
        column: msg.column,
        ruleId: msg.ruleId,
        message: msg.message,
      }))
    );
  } catch (e) {
    console.error("Fatal: Could not parse ESLint JSON output.");
    return [
      {
        tool: "ESLint",
        severity: "Error",
        filePath: "N/A",
        line: 0,
        message:
          "Could not parse ESLint output from file. The JSON might be malformed.",
      },
    ];
  }
}

async function runAllChecks() {
  await mkdir(outputDir, { recursive: true });

  const [tsIssues, eslintIssues] = await Promise.all([
    getTypeScriptIssues(),
    getEslintIssues(),
  ]);

  const allIssues = [...tsIssues, ...eslintIssues].sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line
  );

  if (allIssues.length === 0) {
    console.log("All checks passed successfully!");
    const successMessage =
      "All checks (TypeScript & ESLint) passed successfully.";
    await writeFile(outputFile, "```\n" + successMessage + "\n```");
    process.exit(0);
  }

  console.error(
    `Found ${allIssues.length} total issues. Generating detailed log in ${outputFile}`
  );

  const formattedIssues = await Promise.all(
    allIssues.map(async (issue, index) => {
      const issueNumber = index + 1;
      const context = await getCodeContext(issue.filePath, issue.line);
      let issueHeader;
      if (issue.tool === "TypeScript") {
        issueHeader = `\n[TypeScript] ${issue.message}`;
      } else {
        issueHeader = `\n[ESLint/${issue.ruleId || "core"}] ${issue.message}`;
      }
      const location = `${issue.filePath} (Line ${issue.line}, Col ${issue.column})`;
      return `------------------------------------------------------------\nIssue #${issueNumber}: ${issue.severity.toUpperCase()} in ${location}\n${issueHeader}\n\n${context}\n------------------------------------------------------------`;
    })
  );

  const logHeader = `Static Analysis Log - ${new Date().toLocaleString()}\nFound ${
    allIssues.length
  } total issues.\n\n`;
  const finalLogContent = logHeader + formattedIssues.join("\n\n");

  await writeFile(outputFile, "```\n" + finalLogContent + "\n```");

  const hasErrors = allIssues.some((p) => p.severity === "Error");
  process.exit(hasErrors ? 1 : 0);
}

runAllChecks().catch((err) => {
  console.error("An unexpected error occurred during script execution:", err);
  process.exit(1);
});
