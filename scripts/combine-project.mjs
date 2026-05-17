// --- START OF FILE scripts/combine-project.mjs ---

import fs from "fs/promises";
import path from "path";

// --- הגדרות ---

// שם הסקריפט, כדי למנוע ממנו לכלול את עצמו
const SCRIPT_NAME = path.basename(import.meta.url);

// תיקיות שיש להתעלם מהן לחלוטין
const EXCLUDED_FOLDERS = new Set([
  "node_modules",
  "dist",
  "public",
  ".vite",
  ".firebase",
  ".git",
  "src-tauri", // למקרה שיש
  "script-outputs", // כדי לא לכלול פלטים של סקריפטים קודמים
]);

// קבצים ספציפיים שיש להתעלם מהם
const EXCLUDED_FILES = new Set([
  ".gitignore",
  "README.md",
  ".firebaserc",
  ".env.local",
  "package-lock.json",
  "firebase-debug.log",
  ".DS_Store",
  "Thumbs.db",
]);

// סיומות קבצים שיש להתעלם מהן (קבצים בינאריים, תמונות וכו')
const EXCLUDED_EXTENSIONS = new Set([
  ".zip",
  ".exe",
  ".dll",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".bin",
  ".log",
  ".txt", // כדי לא לכלול קבצי פלט קודמים
]);

// פונקציית עזר להצגת טקסט עברי תקין בטרמינל
const rtl = (str) => str.split("").reverse().join("");

/**
 * בודק אם קובץ או תיקייה צריכים להיות מסוננים החוצה.
 * @param {fs.Dirent} entry - רשומת מערכת הקבצים.
 * @param {string} dirPath - הנתיב לתיקייה המכילה את הרשומה.
 * @param {string} outputFileName - שם קובץ הפלט, כדי למנוע הכללה עצמית.
 * @returns {boolean} - true אם יש לסנן, אחרת false.
 */
function isExcluded(entry, dirPath, outputFileName) {
  const fullPath = path.join(dirPath, entry.name);

  // סינון לפי שם קובץ ספציפי, שם הסקריפט, או שם קובץ הפלט
  if (
    EXCLUDED_FILES.has(entry.name) ||
    entry.name === SCRIPT_NAME ||
    path.basename(outputFileName) === entry.name
  ) {
    return true;
  }

  // סינון לפי סיומת קובץ
  const extension = path.extname(entry.name);
  if (EXCLUDED_EXTENSIONS.has(extension)) {
    return true;
  }

  // סינון לפי תיקייה
  const pathParts = fullPath.split(path.sep);
  for (const part of pathParts) {
    if (EXCLUDED_FOLDERS.has(part)) {
      return true;
    }
  }

  return false;
}

/**
 * פונקציה רקורסיבית לסריקת התיקיות ואיסוף קבצים רלוונטיים.
 * @param {string} dir - התיקייה להתחיל ממנה.
 * @param {string} outputFileName - שם קובץ הפלט.
 * @returns {Promise<string[]>} - מערך של נתיבי קבצים מלאים.
 */
async function collectFiles(dir, outputFileName) {
  const collected = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (isExcluded(entry, dir, outputFileName)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...(await collectFiles(fullPath, outputFileName)));
    } else {
      collected.push(fullPath);
    }
  }
  return collected;
}

/**
 * הפונקציה הראשית שמריצה את תהליך האיחוד.
 */
async function main() {
  console.log(rtl("...מתחיל תהליך איחוד קבצי הפרויקט"));

  const rootDir = process.cwd();
  const folderName = path.basename(rootDir);
  const outputDir = "script-outputs";
  const outputFileName = path.join(
    outputDir,
    `${folderName}_combined_code.txt`
  );

  // יצירת תיקיית הפלט אם היא לא קיימת
  await fs.mkdir(outputDir, { recursive: true });
  console.log(rtl(`:יוצר קובץ מאוחד בשם '${outputFileName}'`));

  try {
    // מחיקת קובץ ישן אם קיים
    await fs.rm(outputFileName, { force: true });

    const allFiles = await collectFiles(rootDir, outputFileName);
    let combinedContent = "";

    console.log(
      rtl(`...נמצאו ${allFiles.length} קבצים רלוונטיים. מאחד אותם כעת`)
    );

    for (const file of allFiles) {
      const relativePath = path.relative(rootDir, file).replace(/\\/g, "/");
      const content = await fs.readFile(file, "utf-8");

      // בניגוד לסקריפטים הקודמים, כאן אנחנו *לא* מסירים הערות!

      combinedContent += `--- START OF FILE: /${relativePath} ---\n\n`;
      combinedContent += content;
      combinedContent += `\n\n--- END OF FILE: /${relativePath} ---\n\n`;
    }

    await fs.writeFile(outputFileName, combinedContent);
    console.log(
      rtl(`.הקוד אוחד בהצלחה לקובץ "${outputFileName}" ✅ תהליך הושלם! הקובץ`)
    );
  } catch (error) {
    console.error(rtl("אירעה שגיאה במהלך תהליך האיחוד:"), error);
  }
}

main().catch(console.error);
