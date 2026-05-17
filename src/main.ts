import { AppData } from "./types";

// --- Data Structure ---
let appData: AppData = {
  projects: [],
  activeProjectId: null,
  currentView: "project", // project | management
  activeTimer: {
    chapterId: null,
    intervalId: null,
    startTime: null,
    parsha: "",
  },
  googleApi: {
    clientId: null,
    apiKey: null,
  },
  lastSyncDate: 0,
};

// --- Helpers ---
function getFormattedHebrewDate(timestamp, parsha) {
  const date = new Date(timestamp);
  const days = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

  // פונקציית עזר להמרת מספרים לאותיות עבריות (גימטריה תקנית)
  function toHebrewLetters(n) {
    if (isNaN(n)) return "";
    let str = "";
    if (n >= 5000) n %= 1000; // 5786 -> 786
    const hundreds = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];

    str += hundreds[Math.floor(n / 100)];
    n %= 100;

    if (n === 15) return str + 'ט"ו';
    if (n === 16) return str + 'ט"ז';

    str += tens[Math.floor(n / 10)];
    n %= 10;
    str += ones[n];

    // הוספת גרשיים
    if (str.length > 1) return str.slice(0, -1) + '"' + str.slice(-1);
    if (str.length === 1) return str + "'";
    return str;
  }

  const hebrewFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let hebrewDateStr = "";
  for (const part of hebrewFormatter.formatToParts(date)) {
    // תופסים את המספרים בלבד ומתרגמים אותם לאותיות
    if (part.type === "day" || part.type === "year") {
      hebrewDateStr += toHebrewLetters(parseInt(part.value, 10));
    } else {
      hebrewDateStr += part.value; // משאיר את הקידומת ' ב' או את שם החודש כפי שהוא
    }
  }

  // הפקת תאריך לועזי נקי ומוכר (לדוגמה: 12/05/2026)
  const gregorianDateStr = date
    .toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\./g, "/");

  let result = `יום ${days[date.getDay()]}`;
  if (parsha) result += ` (${parsha})`;

  result += ` • ${hebrewDateStr} • ${gregorianDateStr}`;
  return result;
}

async function fetchParsha() {
  try {
    const res = await fetch(
      "https://www.hebcal.com/shabbat?cfg=json&geonameid=281184",
    );
    const data = await res.json();
    const item = data.items.find((i) => i.category === "parashat");
    return item ? item.hebrew : "";
  } catch (e) {
    return "";
  }
}

function formatDuration(totalSeconds) {
  const isNegative = totalSeconds < 0;
  const absSec = Math.abs(totalSeconds);
  const h = Math.floor(absSec / 3600);
  const m = Math.floor((absSec % 3600) / 60);
  const s = Math.floor(absSec % 60);
  const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return isNegative ? `-${timeStr}` : timeStr;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
  }).format(amount);
}

function formatSimpleTime(ts) {
  return new Date(ts).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// --- Dynamic Favicon & Focus Overlay Logic ---
let focusOverlayMinimized = false;

function updateFavicon() {
  const isRunning = appData.activeTimer.chapterId !== null;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  let color = isDark ? "ffffff" : "000000";
  if (isRunning) color = "dc2626"; // אדום אם פעיל

  // נתיב SVG נקי לסמל השעון (schedule מתוך Material Symbols)
  const svgPath =
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23${color}"><path d="${svgPath}"/></svg>`;
  (document.getElementById("dynamicFavicon") as HTMLLinkElement).href =
    "data:image/svg+xml," + svg;
  // הוספת חיווי (Badge) לאייקון בשורת המשימות של מערכת ההפעלה כשהאפליקציה מותקנת
  if ("setAppBadge" in navigator && "clearAppBadge" in navigator) {
    if (isRunning) {
      navigator.setAppBadge().catch(console.error);
    } else {
      navigator.clearAppBadge().catch(console.error);
    }
  }
}

function minimizeFocusOverlay() {
  document.getElementById("focusOverlay").classList.remove("open");
  focusOverlayMinimized = true;
}

function restoreFocusOverlay() {
  const p = getActiveProject();
  if (!p || !appData.activeTimer.chapterId) return;
  const c = p.chapters.find((ch) => ch.id === appData.activeTimer.chapterId);

  document.getElementById("focusProjectName").innerText = p.name;
  document.getElementById("focusChapterName").innerText = c ? c.name : "";
  document.getElementById("focusOverlay").classList.add("open");
  focusOverlayMinimized = false;
  updateDashboardRealtime();
}

// --- Theme, Analytics & Cloud Sync Logic ---
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("torahTimeTheme", newTheme);
  renderMainContent(); // כדי שהאייקון בכפתור יתעדכן
  updateFavicon();
}

function openAnalyticsModal() {
  const p = getActiveProject();
  if (!p) return;

  // חישוב 7 ימים אחרונים
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let daysData = [];
  const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

  for (let i = 6; i >= 0; i--) {
    let d = new Date(today);
    d.setDate(d.getDate() - i);
    daysData.push({
      dateObj: d,
      label: i === 0 ? "היום" : dayNames[d.getDay()],
      totalSec: 0,
    });
  }

  // סריקת שעות במשימות הפתוחות
  p.chapters.forEach((c) => {
    c.sessions.forEach((s) => {
      let sDate = new Date(s.start);
      sDate.setHours(0, 0, 0, 0);
      let dayMatch = daysData.find(
        (d) => d.dateObj.getTime() === sDate.getTime(),
      );
      if (dayMatch && s.duration > 0) dayMatch.totalSec += s.duration;
    });
  });

  // חישוב מקסימום לגובה העמודות
  let maxSec = Math.max(...daysData.map((d) => d.totalSec));
  if (maxSec === 0) maxSec = 3600; // במידה ואין נתונים נייצר סקאלה של שעה

  // בניית הגרף ב-HTML מינימליסטי
  const chartHtml = daysData
    .map((d) => {
      const heightPercent = Math.max((d.totalSec / maxSec) * 100, 2); // מינימום 2% גובה
      const hours = (d.totalSec / 3600).toFixed(1);
      return `
                                    <div class="chart-col">
                                        <span class="chart-val">${parseFloat(hours) > 0 ? hours + "h" : ""}</span>
                                        <div class="chart-bar" style="height: ${heightPercent}%;"></div>
                                        <span class="chart-label">${d.label}</span>
                                    </div>
                                    `;
    })
    .join("");

  document.getElementById("analyticsChart").innerHTML = chartHtml;
  const total7Days = daysData.reduce((sum, d) => sum + d.totalSec, 0);
  document.getElementById("analyticsTotal7Days").innerText =
    formatDuration(total7Days);

  openModal("analyticsModal");
}

function openDriveSyncModal() {
  const statusDiv = document.getElementById("driveSyncStatus");
  const actionDiv = document.getElementById("driveSyncMainAction");

  statusDiv.innerHTML = `
            <span class="material-symbols-rounded" style="font-size: 45px; color: var(--accent-blue); margin-bottom: 10px;">cloud_sync</span>
            <div style="color: var(--text-main); font-weight: 500; font-size: 1.2rem;">גיבוי מאובטח ל-Google Drive</div>
            <p style="font-size: 0.95rem; color: var(--text-muted); margin-top: 10px; line-height: 1.6;">
              בלחיצה על הכפתור מטה, תתבקש לאשר חיבור לחשבון הגוגל שלך. המערכת תייצר קובץ גיבוי מעודכן בדרייב הפרטי שלך.
              <br><br>
              לאחר הגיבוי הראשוני, המערכת תבצע סנכרון שקט אחת ל-24 שעות. במידה והסנכרון האוטומטי ייכשל (לדוגמה עקב ניתוק מגוגל), יופיע חיווי אדום על סמל הענן בסרגל העליון ותידרש פעולת גיבוי ידנית.
            </p>
        `;

  actionDiv.innerHTML = `
            <button class="btn btn-primary" onclick="performRealDriveSync()" style="width: 100%; padding: 14px; font-size: 1.1rem; border-radius: 30px;">
                <span class="material-symbols-rounded">cloud_upload</span> בצע סנכרון לחשבון שלי
            </button>
        `;

  openModal("driveSyncModal");
}

// --- Google Drive Sync Real Logic ---
// !!! המפתחות הגלובליים של האפליקציה !!!
const GOOGLE_CLIENT_ID =
  "176903424184-4r6g8f28set7eojavac2aaijrtj742ng.apps.googleusercontent.com";
const GOOGLE_API_KEY = "AIzaSyAyIXfH78qoWxUgs5PPJKZvWUxtYNzTs-8";

let tokenClient;
let gapiInited = false;
let gisInited = false;
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FILE_NAME = "torah_time_backup.json";

async function initializeGoogleApi() {
  if (
    !GOOGLE_CLIENT_ID ||
    GOOGLE_CLIENT_ID.includes("YOUR_CLIENT_ID") ||
    !GOOGLE_API_KEY ||
    GOOGLE_API_KEY.includes("YOUR_API_KEY")
  ) {
    alert("שגיאה: מפתח המערכת טרם הגדיר מפתחות API תקינים בקוד האפליקציה.");
    return false;
  }

  try {
    await new Promise((resolve, reject) => {
      gapi.load("client", { callback: resolve, onerror: reject });
    });
    await gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    });
    gapiInited = true;

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: "",
    });
    gisInited = true;
    return true;
  } catch (err) {
    console.error("Error initializing Google API:", err);
    alert("שגיאה בהתחברות לגוגל. בדוק את חיבור הרשת או שפנה לתמיכה.");
    return false;
  }
}

async function performRealDriveSync() {
  const btn = document.querySelector("#driveSyncModal .btn-primary");
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<span class="material-symbols-rounded">autorenew</span> מתחבר...';

  // אם עדיין לא אתחלנו את הספריות מול גוגל, נעשה זאת עכשיו
  if (!gapiInited || !gisInited) {
    const initSuccess = await initializeGoogleApi();
    if (!initSuccess) {
      btn.innerHTML = originalText;
      return;
    }
  }

  // הגדרת הפעולה שתקרה ברגע שגוגל יחזירו לנו אישור (Token)
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      alert("שגיאה בהתחברות לגוגל: " + resp.error);
      btn.innerHTML = originalText;
      return;
    }
    // יש לנו אישור! נתחיל את ההעלאה
    btn.innerHTML =
      '<span class="material-symbols-rounded">cloud_upload</span> מגבה נתונים...';
    await uploadDataToDrive();
    btn.innerHTML = originalText;
  };

  // בקשת חלון התחברות (Popup) של גוגל
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: "consent" });
  } else {
    tokenClient.requestAccessToken({ prompt: "" }); // אם כבר אישר בעבר, לא יקפוץ שוב
  }
}

async function uploadDataToDrive() {
  try {
    const FOLDER_NAME = "קבצי גיבוי נתונים של תוכנת שעות זמניות";

    // 1. בדיקה האם קיימת תיקיית הגיבוי, ואם לא - יצירתה
    let folderId = null;
    const folderResponse = await gapi.client.drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
      spaces: "drive",
      fields: "files(id)",
    });

    if (folderResponse.result.files && folderResponse.result.files.length > 0) {
      folderId = folderResponse.result.files[0].id;
    } else {
      const createdFolder = await gapi.client.drive.files.create({
        resource: {
          name: FOLDER_NAME,
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id",
      });
      folderId = createdFolder.result.id;
    }

    const fileContent = JSON.stringify(appData);
    const fileMetadata: any = {
      name: BACKUP_FILE_NAME,
      mimeType: "application/json",
    };

    // 2. בדיקה האם כבר קיים קובץ גיבוי בדרייב (ונשלוף גם את ההורים שלו)
    const response = await gapi.client.drive.files.list({
      q: `name='${BACKUP_FILE_NAME}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name, parents)",
    });

    const files = response.result.files;
    let fileId = files && files.length > 0 ? files[0].id : null;
    let currentParents = files && files.length > 0 ? files[0].parents : [];

    // אם זה קובץ חדש, נכניס אותו ישירות לתוך התיקייה
    if (!fileId) {
      fileMetadata.parents = [folderId];
    }

    // 2. בניית הבקשה להעלאה (Multipart Request)
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--\r\n";

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(fileMetadata) +
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      fileContent +
      close_delim;

    // אם הקובץ קיים נעשה PATCH (עדכון), אם לא נעשה POST (יצירה)
    let requestParams: any = {
      path: fileId
        ? `/upload/drive/v3/files/${fileId}`
        : "/upload/drive/v3/files",
      method: fileId ? "PATCH" : "POST",
      params: { uploadType: "multipart" },
      headers: {
        "Content-Type": 'multipart/related; boundary="' + boundary + '"',
      },
      body: multipartRequestBody,
    };

    await gapi.client.request(requestParams);

    // במידה והקובץ הישן היה קיים אבל מחוץ לתיקייה, נעביר אותו לתוכה עכשיו
    if (
      fileId &&
      folderId &&
      (!currentParents || !currentParents.includes(folderId))
    ) {
      await gapi.client.drive.files.update({
        fileId: fileId,
        addParents: folderId,
        removeParents: currentParents.join(","),
        fields: "id, parents",
      });
    }

    // 3. עדכון ממשק המשתמש
    appData.lastSyncDate = Date.now();
    saveData();
    renderMainContent(); // רענון המסך להסרת חיווי אזהרה

    document.getElementById("driveSyncStatus").innerHTML = `
                  <span class="material-symbols-rounded" style="font-size: 40px; color: var(--accent-green); margin-bottom: 10px;">cloud_done</span>
                  <div style="color: var(--text-main); font-weight: 500;">הסנכרון הושלם בהצלחה</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">קובץ הגיבוי ${BACKUP_FILE_NAME} עכשיו מעודכן בדרייב שלך.</div>
              `;
  } catch (err) {
    console.error("Upload error", err);
    alert("שגיאה בהעלאת הקובץ לגוגל דרייב.");
  }
}

// --- Auto Sync Logic ---
async function attemptAutoSync() {
  if (!navigator.onLine || !appData.lastSyncDate) return;

  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (Date.now() - appData.lastSyncDate > ONE_DAY) {
    // אם לא אתחלנו את גוגל עדיין, נעשה זאת עכשיו
    if (!gapiInited || !gisInited) {
      const initSuccess = await initializeGoogleApi();
      if (!initSuccess) return;
    }

    // הגדרת קולבק שקט
    tokenClient.callback = async (resp) => {
      if (resp.error !== undefined) return; // נכשל שקט
      await uploadDataToDrive();
    };

    // ניסיון משיכת טוקן ללא חלון קופץ
    if (gapi.client.getToken() === null) {
      try {
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (e) {
        console.log("Auto-sync requires interaction.");
      }
    } else {
      await uploadDataToDrive();
    }
  }
}

// --- Terms of Service ---
const CURRENT_TOS_VERSION = "v1";

function checkTos() {
  const agreedVersion = localStorage.getItem("torahTimeTosAgreed");
  // אם אין אישור בכלל, או שהאישור הוא מגרסה ישנה, נציג את המודאל
  if (agreedVersion !== CURRENT_TOS_VERSION) {
    const tosModal = document.getElementById("tosModal");
    if (tosModal) tosModal.classList.add("open");
  }
}

function acceptTos() {
  // שומרים את הגרסה הספציפית שהמשתמש אישר
  localStorage.setItem("torahTimeTosAgreed", CURRENT_TOS_VERSION);
  const tosModal = document.getElementById("tosModal");
  if (tosModal) tosModal.classList.remove("open");
}

// --- Init & Storage ---
function init() {
  // רישום מנוע ה-PWA לעבודה באופליין
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch((err) => console.log("PWA SW error:", err));
    });
  }

  // טעינת מצב לילה
  const savedTheme = localStorage.getItem("torahTimeTheme");
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  const saved = localStorage.getItem("torahTimeProV2");
  if (saved) {
    appData = JSON.parse(saved);
    if (!appData.googleApi)
      appData.googleApi = { clientId: null, apiKey: null }; // תאימות לאחור
    if (appData.activeTimer && appData.activeTimer.chapterId) resumeTimer();
  }
  appData.currentView = "project"; // תמיד מתחילים מתצוגת פרויקט
  renderApp();
  updateTabTitle();
  updateFavicon();
  checkTos();

  // ננסה להפעיל סנכרון אוטומטי כמה שניות לאחר עליית האפליקציה
  setTimeout(attemptAutoSync, 3000);
}

function saveData() {
  localStorage.setItem("torahTimeProV2", JSON.stringify(appData));
}

function downloadBackup() {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(appData));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = `backup_torah_time_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerImport() {
  document.getElementById("importFile").click();
}
function handleFileImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e: any) {
    try {
      const importedData = JSON.parse(e.target.result as string);
      if (!importedData.projects) return alert("קובץ לא תקין.");
      if (confirm("האם לדרוס הכל ולשחזר מהקובץ?")) {
        appData = importedData;
        saveData();
        renderProjectList();
        renderMainContent();
        alert("שוחזר בהצלחה!");
      }
    } catch (err) {
      alert("שגיאה בקריאת הקובץ.");
    }
  };
  reader.readAsText(file);
  input.value = "";
}

// --- Projects ---
function getActiveProject() {
  const p = appData.projects.find((p) => p.id === appData.activeProjectId);
  if (p && !p.adjustments) p.adjustments = []; // תאימות
  if (p && !p.debt) p.debt = 0;
  return p;
}

function addProject() {
  const name = (document.getElementById("newProjectName") as HTMLInputElement)
    .value;
  const rate =
    parseFloat(
      (document.getElementById("newProjectRate") as HTMLInputElement).value,
    ) || 0;
  if (!name) return;
  const newProject = {
    id: Date.now().toString(),
    name: name,
    rate: rate,
    debt: 0,
    chapters: [],
    paymentBatches: [],
    adjustments: [],
  };
  appData.projects.push(newProject);
  appData.activeProjectId = newProject.id;
  closeModal("projectModal");
  (document.getElementById("newProjectName") as HTMLInputElement).value = "";
  saveData();
  renderProjectList();
  renderMainContent();
}

function selectProject(id: string) {
  appData.activeProjectId = id;
  saveData();
  renderProjectList();
  renderApp();
  updateTabTitle();
}
// --- Helper: Today's Stats ---

// --- Project Settings & Archive ---

function openDebtModal() {
  const p = getActiveProject();
  if (!p) return;
  (document.getElementById("editDebtInput") as HTMLInputElement).value = (
    p.debt || 0
  ).toString();
  openModal("debtModal");
}

function saveDebtModal() {
  const p = getActiveProject();
  if (!p) return;
  const newDebt = parseFloat(
    (document.getElementById("editDebtInput") as HTMLInputElement).value,
  );
  if (!isNaN(newDebt)) {
    p.debt = newDebt;
    saveData();
    renderMainContent();
    closeModal("debtModal");
  }
}

// --- Financial Adjustments (New System) ---
function openAdjustmentModal(type: string) {
  closeModal("openAdjustmentsModal"); // --- הוספנו את השורה הזו
  (document.getElementById("adjType") as HTMLInputElement).value = type;
  (document.getElementById("adjModalTitle") as HTMLElement).innerText =
    type === "addition"
      ? "הוספת חיוב / תוספת (לדרוש מהלקוח)"
      : "הוספת זיכוי / הפחתה (לנכות ללקוח)";
  (document.getElementById("adjAmount") as HTMLInputElement).value = "";
  (document.getElementById("adjReason") as HTMLInputElement).value = "";
  openModal("financialAdjustmentModal");
}

function saveFinancialAdjustment() {
  const type = (document.getElementById("adjType") as HTMLInputElement).value;
  let amount = parseFloat(
    (document.getElementById("adjAmount") as HTMLInputElement).value,
  );
  const reason =
    (document.getElementById("adjReason") as HTMLInputElement).value ||
    (type === "addition" ? "חיוב נוסף" : "זיכוי");
  if (isNaN(amount) || amount <= 0) return alert("נא להזין סכום תקין גדול מ-0");
  if (type === "deduction") amount = -Math.abs(amount);

  const p = getActiveProject();
  p.adjustments.push({
    id: Date.now().toString(),
    amount: amount,
    reason: reason,
    date: Date.now(),
    status: "open",
  });
  saveData();
  closeModal("financialAdjustmentModal");
  renderMainContent();
}
function deleteAdjustment(id) {
  if (!confirm("למחוק שורה כספית זו?")) return;
  const p = getActiveProject();
  p.adjustments = p.adjustments.filter((a) => a.id !== id);
  saveData();
  renderMainContent();
}

// --- Chapters & Timer ---
function addChapter() {
  const name = (document.getElementById("newChapterName") as HTMLInputElement)
    .value;
  if (!name) return;
  getActiveProject()?.chapters.push({
    id: Date.now().toString(),
    name: name,
    sessions: [],
  });
  saveData();
  closeModal("chapterModal");
  (document.getElementById("newChapterName") as HTMLInputElement).value = "";
  renderMainContent();
}
function deleteChapter(id) {
  if (!confirm("למחוק את כל המשימה על שעותיה?")) return;
  const p = getActiveProject();
  p.chapters = p.chapters.filter((c) => c.id !== id);
  if (appData.activeTimer.chapterId === id) stopTimer();
  saveData();
  renderMainContent();
}
function updateChapterName(id, val) {
  const c = getActiveProject().chapters.find((x) => x.id === id);
  if (c) {
    c.name = val;
    saveData();
  }
}

async function toggleTimer(chapterId) {
  if (appData.activeTimer.chapterId === chapterId) await stopTimer();
  else {
    if (appData.activeTimer.chapterId) await stopTimer();
    await startTimer(chapterId);
  }
}
async function startTimer(chapterId: string) {
  appData.activeTimer.chapterId = chapterId;
  appData.activeTimer.startTime = Date.now();
  fetchParsha().then((p) => {
    appData.activeTimer.parsha = p;
  });

  restoreFocusOverlay(); // פותח את מסך המיקוד

  renderMainContent();
  updateDashboardRealtime();
  appData.activeTimer.intervalId = setInterval(
    updateDashboardRealtime,
    1000,
  ) as unknown as number;
  saveData();

  updateTabTitle();
  updateFavicon();
}
async function stopTimer() {
  if (!appData.activeTimer.chapterId) return;
  if (appData.activeTimer.intervalId) {
    clearInterval(appData.activeTimer.intervalId as number);
  }

  document.getElementById("focusOverlay")!.classList.remove("open");
  const duration = Math.floor(
    (Date.now() - (appData.activeTimer.startTime || 0)) / 1000,
  );
  const c = getActiveProject()?.chapters.find(
    (ch) => ch.id === appData.activeTimer.chapterId,
  );
  if (c && duration > 0) {
    c.sessions.push({
      id: Date.now().toString(),
      start: appData.activeTimer.startTime!,
      end: Date.now(),
      duration: duration,
      parsha: appData.activeTimer.parsha,
      status: "open",
    });
  }
  appData.activeTimer = {
    chapterId: null,
    intervalId: null,
    startTime: null,
    parsha: "",
  };
  saveData();
  renderMainContent();

  updateTabTitle();
  updateFavicon();
}

function resumeTimer() {
  if (appData.activeTimer.chapterId)
    appData.activeTimer.intervalId = setInterval(updateDashboardRealtime, 1000);
}

// --- Helper: Dynamic Goal Stats ---
function getStartTimeForGoal(type) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (type === "daily") return d.getTime();
  if (type === "weekly") {
    const day = d.getDay(); // 0 is Sunday
    d.setDate(d.getDate() - day);
    return d.getTime();
  }
  if (type === "monthly") {
    d.setDate(1);
    return d.getTime();
  }
  return d.getTime();
}

function getGlobalStatsForGoal(type) {
  const startTs = getStartTimeForGoal(type);
  let totalSec = 0;
  let totalMoney = 0;

  appData.projects.forEach((p) => {
    p.chapters.forEach((c) => {
      c.sessions.forEach((s) => {
        if (s.start >= startTs && s.duration > 0) {
          totalSec += s.duration;
          totalMoney += (s.duration / 3600) * (p.rate || 0);
        }
      });
    });
  });

  if (appData.activeTimer.chapterId) {
    const diff = Math.floor(
      (Date.now() - appData.activeTimer.startTime) / 1000,
    );
    totalSec += diff;
    const activeP = appData.projects.find((p) =>
      p.chapters.some((ch) => ch.id === appData.activeTimer.chapterId),
    );
    if (activeP) totalMoney += (diff / 3600) * (activeP.rate || 0);
  }
  return { totalSec, totalMoney };
}

// --- Project Settings & Archive ---
function openProjectSettingsModal() {
  const p = getActiveProject();
  if (!p) return;
  (document.getElementById("editProjNameInput") as HTMLInputElement).value =
    p.name;
  (document.getElementById("editProjRateInput") as HTMLInputElement).value = (
    p.rate || 0
  ).toString();
  (document.getElementById("editProjVatInput") as HTMLInputElement).checked =
    !!p.vatEnabled;

  const arcBtn = document.getElementById("toggleArchiveBtn") as HTMLElement;
  if (p.archived) {
    arcBtn.innerText = "החזר מארכיון";
    arcBtn.style.color = "var(--accent-green)";
  } else {
    arcBtn.innerText = "העבר לארכיון";
    arcBtn.style.color = "var(--text-main)";
  }
  openModal("projectSettingsModal");
}

function toggleProjectArchive() {
  const p = getActiveProject();
  if (!p) return;
  p.archived = !p.archived;
  saveData();
  renderApp();
  closeModal("projectSettingsModal");
}

function toggleArchiveById(id) {
  const p = appData.projects.find((proj) => proj.id === id);
  if (!p) return;
  p.archived = !p.archived;
  saveData();
  renderApp(); // מרנדר מחדש את המסך הנוכחי (תצוגת הניהול)
}

function saveProjectSettings() {
  const p = getActiveProject();
  if (!p) return;
  const newRate = parseFloat(
    (document.getElementById("editProjRateInput") as HTMLInputElement).value,
  );
  const newName = (
    document.getElementById("editProjNameInput") as HTMLInputElement
  ).value.trim();

  if (!isNaN(newRate)) p.rate = newRate;
  if (newName) p.name = newName;
  p.vatEnabled = (
    document.getElementById("editProjVatInput") as HTMLInputElement
  ).checked;

  saveData();
  renderMainContent();
  closeModal("projectSettingsModal");
}

// --- Goals Logic ---
function openGoalModal() {
  // המרת נתונים ישנים אם קיימים
  if (typeof appData.dailyGoal === "number") {
    appData.goal = {
      type: "daily",
      unit: "money",
      value: appData.dailyGoal,
    };
    delete appData.dailyGoal;
  }
  const goal = appData.goal || { type: "daily", unit: "money", value: 0 };
  (document.getElementById("goalType") as HTMLSelectElement).value = goal.type;
  (document.getElementById("goalUnit") as HTMLSelectElement).value = goal.unit;
  (document.getElementById("goalValueInput") as HTMLInputElement).value =
    goal.value ? goal.value.toString() : "";
  openModal("goalModal");
}

function saveGoalModal() {
  const val =
    parseFloat(
      (document.getElementById("goalValueInput") as HTMLInputElement).value,
    ) || 0;
  const type = (document.getElementById("goalType") as HTMLSelectElement)
    .value as "daily" | "weekly" | "monthly";
  const unit = (document.getElementById("goalUnit") as HTMLSelectElement)
    .value as "money" | "hours";
  appData.goal = { type, unit, value: val };
  saveData();
  closeModal("goalModal");
  updateDashboardRealtime();
}

function updateDashboardRealtime() {
  const p = getActiveProject();
  if (!p) return;
  const activeCid = appData.activeTimer.chapterId;
  const sessionDiff = activeCid
    ? Math.floor((Date.now() - appData.activeTimer.startTime) / 1000)
    : 0;

  // עדכון מד התקדמות נקי
  const goalBadge = document.getElementById("dailyTotalDisplay");
  if (goalBadge) {
    if (typeof appData.dailyGoal === "number") {
      appData.goal = {
        type: "daily",
        unit: "money",
        value: appData.dailyGoal,
      };
      delete appData.dailyGoal;
    }
    const goal = appData.goal || {
      type: "daily",
      unit: "money",
      value: 0,
    };
    const stats = getGlobalStatsForGoal(goal.type);

    if (goal.value > 0) {
      let currentVal =
        goal.unit === "money" ? stats.totalMoney : stats.totalSec / 3600;
      const pct = Math.min((currentVal / goal.value) * 100, 100);

      let currentStr =
        goal.unit === "money"
          ? `₪${stats.totalMoney.toFixed(0)}`
          : formatDuration(stats.totalSec).substring(0, 5);
      let targetStr =
        goal.unit === "money" ? `₪${goal.value}` : `${goal.value}h`;

      // בזכות RTL, האיבר הראשון ב-flex ימוקם מימין (הנתון הנוכחי) והשני משמאל (היעד)
      goalBadge.innerHTML = `
                                            <div class="goal-widget">
                                                <div class="goal-fill" style="width: ${pct}%"></div>
                                                <div class="goal-text">
                                                    <span class="goal-current">${currentStr}</span>
                                                    <span class="goal-target">${targetStr}</span>
                                                </div>
                                            </div>
                                        `;
    } else {
      let currentStr = `₪${stats.totalMoney.toFixed(0)}`;
      goalBadge.innerHTML = `
                                            <div class="goal-widget">
                                                <div class="goal-text" style="justify-content: center; color: var(--text-muted);">
                                                    <span>${currentStr} (הגדר יעד)</span>
                                                </div>
                                            </div>
                                        `;
    }
  }
  if (activeCid) {
    const totalDur = getChapterDuration(activeCid, "open") + sessionDiff;
    const el = document.getElementById(`timer-${activeCid}`);
    const elTotal = document.getElementById(`timer-total-${activeCid}`);

    if (el) {
      el.innerText = formatDuration(sessionDiff); // מונה נוכחי בלבד כשהטיימר עובד
    }
    if (elTotal) {
      elTotal.innerText = formatDuration(totalDur);
      elTotal.style.display = "block";
    }

    updateTabTitle();

    // עדכון מסך המיקוד במידה והוא פתוח  \
    if (!focusOverlayMinimized) {
      const focusTimeEl = document.getElementById("focusTimeDisplay");
      const focusTotalTimeEl = document.getElementById("focusTotalTimeDisplay");
      if (focusTimeEl) focusTimeEl.innerText = formatDuration(sessionDiff);
      if (focusTotalTimeEl)
        focusTotalTimeEl.innerText = formatDuration(totalDur);
    }
  }
}

function getChapterDuration(cid, status) {
  const c = getActiveProject().chapters.find((x) => x.id === cid);
  if (!c) return 0;
  return c.sessions
    .filter((s) => status === "all" || s.status === status)
    .reduce((sum, s) => sum + s.duration, 0);
}

// --- Time Deductions (Manual minutes removal) ---
let deductionChapterId = null;
function openDeductionModal(chapterId: string, chapterName: string) {
  deductionChapterId = chapterId;
  (document.getElementById("deductChapterNameTitle") as HTMLElement).innerText =
    chapterName;
  (document.getElementById("deductionMinutes") as HTMLInputElement).value = "";
  (document.getElementById("deductionReason") as HTMLInputElement).value = "";
  openModal("deductionModal");
}
function addDeduction() {
  const mins = parseInt(
    (document.getElementById("deductionMinutes") as HTMLInputElement).value,
  );
  const reason =
    (document.getElementById("deductionReason") as HTMLInputElement).value ||
    "הפחתה ידנית";
  if (!deductionChapterId || isNaN(mins) || mins <= 0)
    return alert("הזן מספר תקין");
  const c = getActiveProject().chapters.find(
    (ch) => ch.id === deductionChapterId,
  );
  if (c) {
    c.sessions.push({
      id: Date.now().toString(),
      start: Date.now(),
      end: Date.now(),
      duration: -(mins * 60),
      parsha: reason,
      status: "open",
      type: "deduction",
    });
    saveData();
    closeModal("deductionModal");
    renderMainContent();
  }
}

// --- Edit Sessions ---
function editSession(chapterId: string, sessionId: string) {
  const s = getActiveProject()
    ?.chapters.find((ch) => ch.id === chapterId)
    ?.sessions.find((session) => session.id === sessionId);
  if (!s) return;
  if (s.type === "deduction") return alert("לא ניתן לערוך הפחתת זמן ידנית.");
  (document.getElementById("editChapterId") as HTMLInputElement).value =
    chapterId;
  (document.getElementById("editSessionId") as HTMLInputElement).value =
    sessionId;
  const dStart = new Date(s.start);
  const dEnd = new Date(s.end);
  (document.getElementById("editStartTime") as HTMLInputElement).value =
    dStart.getHours().toString().padStart(2, "0") +
    ":" +
    dStart.getMinutes().toString().padStart(2, "0");
  (document.getElementById("editEndTime") as HTMLInputElement).value =
    dEnd.getHours().toString().padStart(2, "0") +
    ":" +
    dEnd.getMinutes().toString().padStart(2, "0");
  (document.getElementById("editParsha") as HTMLInputElement).value =
    s.parsha || "";
  openModal("editSessionModal");
}
function saveSessionEdit() {
  const cid = (document.getElementById("editChapterId") as HTMLInputElement)
    .value;
  const sid = (document.getElementById("editSessionId") as HTMLInputElement)
    .value;
  const tStart = (document.getElementById("editStartTime") as HTMLInputElement)
    .value;
  const tEnd = (document.getElementById("editEndTime") as HTMLInputElement)
    .value;
  if (!tStart || !tEnd) return;
  const s = getActiveProject()
    ?.chapters.find((ch) => ch.id === cid)
    ?.sessions.find((session) => session.id === sid);
  if (!s) return;
  let newStartDate = new Date(s.start);
  const startParts = tStart.split(":");
  newStartDate.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0);
  let newEndDate = new Date(s.end);
  const endParts = tEnd.split(":");
  newEndDate.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0);
  if (newEndDate < newStartDate) newEndDate.setDate(newEndDate.getDate() + 1);
  s.start = newStartDate.getTime();
  s.end = newEndDate.getTime();
  s.duration = Math.floor(
    (newEndDate.getTime() - newStartDate.getTime()) / 1000,
  );
  s.parsha = (document.getElementById("editParsha") as HTMLInputElement).value;
  saveData();
  closeModal("editSessionModal");
  renderMainContent();
}
function deleteSession(chapterId, sessionId) {
  if (!confirm("למחוק שורה זו?")) return;
  const c = getActiveProject().chapters.find((ch) => ch.id === chapterId);
  c.sessions = c.sessions.filter((s) => s.id !== sessionId);
  saveData();
  renderMainContent();
}

// --- GLOBAL PAYMENT SYSTEM (The big fix) ---
let globalPaymentData = null;

function openGlobalPaymentModal() {
  const p = getActiveProject();
  let allOpenSessions = [];
  let totalSec = 0;

  p.chapters.forEach((c) => {
    c.sessions.forEach((s) => {
      if (s.status === "open") {
        allOpenSessions.push({ ...s, chapterId: c.id });
        totalSec += s.duration;
      }
    });
  });

  const openAdjs = p.adjustments.filter((a) => a.status === "open");
  const adjsAmount = openAdjs.reduce((sum, a) => sum + a.amount, 0);
  const hoursAmount = (totalSec / 3600) * p.rate;
  const currentDebt = p.debt || 0;

  const subTotal = hoursAmount + adjsAmount;
  const vatAmount = p.vatEnabled ? subTotal * 0.18 : 0;
  const grandTotal = subTotal + vatAmount + currentDebt;

  if (
    allOpenSessions.length === 0 &&
    openAdjs.length === 0 &&
    currentDebt === 0
  ) {
    return alert("אין נתונים פתוחים (שעות חוב או תוספות) לדרישת תשלום.");
  }

  globalPaymentData = {
    totalSec: totalSec,
    hoursAmount: hoursAmount,
    adjsAmount: adjsAmount,
    vatAmount: vatAmount,
    currentDebt: currentDebt,
    grandTotal: grandTotal,
    openSessions: allOpenSessions,
    openAdjustments: openAdjs,
  };

  document.getElementById("payGlobalHoursAmount").innerText =
    formatMoney(hoursAmount);
  document.getElementById("payGlobalAdjsAmount").innerText =
    formatMoney(adjsAmount);
  document.getElementById("payGlobalDebtAmount").innerText =
    formatMoney(currentDebt);

  const vatContainer = document.getElementById("payGlobalVatContainer");
  if (p.vatEnabled) {
    vatContainer.style.display = "flex";
    document.getElementById("payGlobalVatAmount").innerText =
      formatMoney(vatAmount);
  } else {
    vatContainer.style.display = "none";
  }

  document.getElementById("payGlobalGrandTotal").innerText =
    formatMoney(grandTotal);

  const inputActual = document.getElementById(
    "payGlobalActualReceived",
  ) as HTMLInputElement;
  inputActual.value = grandTotal > 0 ? grandTotal.toFixed(2) : "0";

  openModal("globalPaymentModal");
}

function confirmGlobalPayment() {
  if (!globalPaymentData) return;
  const p = getActiveProject();
  if (!p) return;
  const actualReceived =
    parseFloat(
      (document.getElementById("payGlobalActualReceived") as HTMLInputElement)
        .value,
    ) || 0;

  // יתרה חדשה: מה שנדרש פחות מה ששולם בפועל.
  const newDebt = globalPaymentData.grandTotal - actualReceived;

  const batchId = Date.now().toString();
  p.paymentBatches.push({
    id: batchId,
    name: `סגירת תקופה (${new Date().toLocaleDateString("he-IL")})`,
    date: Date.now(),
    amount: globalPaymentData.hoursAmount + globalPaymentData.adjsAmount, // שווי העבודה הנוכחית ללא יתרות קודמות
    vatEnabled: !!p.vatEnabled,
    vatAmount: globalPaymentData.vatAmount,
    actualPaid: actualReceived,
    debtAfter: newDebt,
    seconds: globalPaymentData.totalSec,
    sessionIds: globalPaymentData.openSessions.map((s) => s.id),
    adjustmentIds: globalPaymentData.openAdjustments.map((a) => a.id),
  });

  // עדכון סטטוס באובייקטים המקוריים
  globalPaymentData.openSessions.forEach((os) => {
    const c = p.chapters.find((ch) => ch.id === os.chapterId);
    const s = c.sessions.find((session) => session.id === os.id);
    if (s) {
      s.status = "paid";
      s.batchId = batchId;
    }
  });

  globalPaymentData.openAdjustments.forEach((oa) => {
    const a = p.adjustments.find((adj) => adj.id === oa.id);
    if (a) {
      a.status = "paid";
      a.batchId = batchId;
    }
  });

  p.debt = newDebt; // שמירת היתרה החדשה לפרויקט
  saveData();
  closeModal("globalPaymentModal");
  renderMainContent();
}

function deleteBatch(batchId) {
  const p = getActiveProject();
  const batch = p.paymentBatches.find((b) => b.id === batchId);
  if (
    !confirm(
      `למחוק את הקבלה "${batch.name}"?\nהשעות והתוספות ששולמו יחזרו לסטטוס 'פתוח'.\nהיתרה הכללית (חוב/זכות) לא תתעדכן אוטומטית ותצטרך לתקן אותה ידנית.`,
    )
  )
    return;

  p.chapters.forEach((c) => {
    c.sessions.forEach((s) => {
      if (s.batchId === batchId) {
        s.status = "open";
        delete s.batchId;
      }
    });
  });
  p.adjustments.forEach((a) => {
    if (a.batchId === batchId) {
      a.status = "open";
      delete a.batchId;
    }
  });

  p.paymentBatches = p.paymentBatches.filter((b) => b.id !== batchId);
  saveData();
  renderMainContent();
}

let archiveModalState: {
  items: any[];
  rate: number;
  batchName: string;
  projectName: string;
  date: number;
  totalAmount: number;
  actualPaid: number;
  vatEnabled?: boolean;
  vatAmount?: number;
} = {
  items: [],
  rate: 0,
  batchName: "",
  projectName: "",
  date: 0,
  totalAmount: 0,
  actualPaid: 0,
};

function renderArchiveTable(filterId: string) {
  const tbody = document.getElementById("archiveTableBody");
  tbody.innerHTML = "";

  // הסרת האקטיב מכל הכרטיסים והוספה לכרטיס הנבחר בלבד
  document
    .querySelectorAll("#archiveFilterContainer .filter-card")
    .forEach((card) => card.classList.remove("active"));
  const activeCard = document.querySelector(
    `#archiveFilterContainer .filter-card[data-filter='${filterId}']`,
  );
  if (activeCard) activeCard.classList.add("active");

  let itemsToRender = archiveModalState.items;
  if (filterId === "adjustments") {
    itemsToRender = archiveModalState.items.filter((i) => i.type === "money");
  } else if (filterId !== "all") {
    itemsToRender = archiveModalState.items.filter(
      (i) => i.type === "time" && i.chapterId === filterId,
    );
  }

  if (itemsToRender.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted);">אין פריטים להצגה</td></tr>';
    return;
  }

  itemsToRender.forEach((item) => {
    const tr = document.createElement("tr");
    if (item.type === "time") {
      const s = item.obj;
      const cost = ((s.duration / 3600) * archiveModalState.rate).toFixed(2);
      tr.innerHTML = `
                                  <td>${item.chapterName}</td>
                                  <td style="direction:rtl; text-align:right;">${getFormattedHebrewDate(s.start, s.parsha)}</td>
                                  <td>${formatSimpleTime(s.start)}</td>
                                  <td>${formatSimpleTime(s.end)}</td>
                                  <td dir="ltr" style="text-align:right">${formatDuration(s.duration)}</td>
                                  <td dir="ltr" style="text-align:right; font-weight:500;">${formatMoney(parseFloat(cost))}</td>
                              `;
    } else {
      const a = item.obj;
      const isNegative = a.amount < 0;
      tr.innerHTML = `
                                  <td><span style="background: var(--bg-body); padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; border: 1px solid var(--border);">תוספת / הפחתה</span></td>
                                  <td style="direction:rtl; text-align:right;">${a.reason}</td>
                                  <td>-</td><td>-</td><td>-</td>
                                  <td dir="ltr" style="text-align:right; font-weight:500; color:${isNegative ? "var(--accent-red)" : "var(--accent-green)"}">
                                      ${formatMoney(a.amount)}
                                  </td>
                              `;
    }
    tbody.appendChild(tr);
  });
}

function openBatchDetails(batchId, projectId) {
  const p = projectId
    ? appData.projects.find((proj) => proj.id === projectId)
    : getActiveProject();
  if (!p) return;
  const batch = p.paymentBatches.find((b) => b.id === batchId);
  if (!batch) return;

  archiveModalState.items = [];
  archiveModalState.rate = p.rate;
  archiveModalState.batchName = batch.name;
  archiveModalState.projectName = p.name;
  archiveModalState.date = batch.date;
  archiveModalState.totalAmount = batch.amount || 0;
  archiveModalState.vatEnabled = batch.vatEnabled || false;
  archiveModalState.vatAmount = batch.vatAmount || 0;
  archiveModalState.actualPaid = batch.actualPaid || 0;

  let chaptersStats = {};
  let adjustmentsTotal = 0;
  let totalBatchSec = 0;

  p.chapters.forEach((c) => {
    c.sessions.forEach((s) => {
      if (s.batchId === batchId) {
        archiveModalState.items.push({
          type: "time",
          obj: s,
          chapterName: c.name,
          chapterId: c.id,
          ts: s.start,
        });

        if (!chaptersStats[c.id])
          chaptersStats[c.id] = { name: c.name, duration: 0 };
        chaptersStats[c.id].duration += s.duration;
        totalBatchSec += s.duration;
      }
    });
  });

  p.adjustments.forEach((a) => {
    if (a.batchId === batchId) {
      archiveModalState.items.push({ type: "money", obj: a, ts: a.date });
      adjustmentsTotal += a.amount;
    }
  });

  archiveModalState.items.sort((a, b) => b.ts - a.ts);
  document.getElementById("archiveProjectName").innerText = batch.name;

  const filterContainer = document.getElementById("archiveFilterContainer");

  // יצירת הכרטיס הראשי (הכל)
  let filterHtml = `
                        <div class="filter-card active" data-filter="all" onclick="renderArchiveTable('all')">
                            <span class="material-symbols-rounded" style="color: var(--text-muted); font-size: 28px;">receipt_long</span>
                            <div class="filter-card-content">
                                <span class="filter-card-title">כל החשבונית</span>
                                <span class="filter-card-sub" dir="ltr">${formatDuration(totalBatchSec)}</span>
                            </div>
                        </div>
                    `;

  // יצירת מיני-כרטיס לכל משימה
  for (const chapterId in chaptersStats) {
    const stat = chaptersStats[chapterId];
    filterHtml += `
                        <div class="filter-card" data-filter="${chapterId}" onclick="renderArchiveTable('${chapterId}')">
                            <span class="material-symbols-rounded" style="color: var(--text-muted); font-size: 28px;">task_alt</span>
                            <div class="filter-card-content">
                                <span class="filter-card-title">${stat.name}</span>
                                <span class="filter-card-sub" dir="ltr">${formatDuration(stat.duration)}</span>
                            </div>
                        </div>`;
  }

  // יצירת מיני-כרטיס לתוספות/הפחתות אם יש
  if (archiveModalState.items.some((i) => i.type === "money")) {
    filterHtml += `
                        <div class="filter-card" data-filter="adjustments" onclick="renderArchiveTable('adjustments')">
                            <span class="material-symbols-rounded" style="color: var(--text-muted); font-size: 28px;">account_balance_wallet</span>
                            <div class="filter-card-content">
                                <span class="filter-card-title">תוספות והפחתות</span>
                                <span class="filter-card-sub" dir="ltr">${formatMoney(Math.abs(adjustmentsTotal))}</span>
                            </div>
                        </div>`;
  }

  filterContainer.innerHTML = filterHtml;
  renderArchiveTable("all");
  openModal("archiveModal");
}
function updateBatchName(batchId, newName) {
  const b = getActiveProject().paymentBatches.find((x) => x.id === batchId);
  if (b) {
    b.name = newName;
    saveData();
  }
}

// --- Rendering ---
function renderProjectList() {
  // בוטל - הפרויקטים מוצגים כעת בתפריט הנפתח
}

function toggleProjectMenu() {
  const dropdown = document.getElementById("projectDropdown");
  if (dropdown) dropdown.classList.toggle("open");
}

// סגירת התפריט בלחיצה מחוץ לו
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("projectDropdown");
  if (dropdown && !dropdown.contains(e.target as Node)) {
    dropdown.classList.remove("open");
  }
});

// --- Modals & Refresh Logic ---
function openChapterSessions(chapterId: string) {
  (document.getElementById("currentViewChapterId") as HTMLInputElement).value =
    chapterId;
  renderChapterSessions(chapterId);
  openModal("chapterSessionsModal");
}

function renderChapterSessions(chapterId) {
  const p = getActiveProject();
  if (!p) return;
  const c = p.chapters.find((ch: { id: any }) => ch.id === chapterId);
  if (!c) return;

  document.getElementById("viewChapterName").innerText = c.name;
  const tbody = document.getElementById("chapterSessionsTableBody");

  const openSessions = c.sessions.filter((s) => s.status === "open");
  openSessions.sort((a, b) => b.start - a.start);

  if (openSessions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">אין שעות פתוחות למשימה זו</td></tr>';
    return;
  }

  tbody.innerHTML = openSessions
    .map((s) => {
      const cost = ((s.duration / 3600) * p.rate).toFixed(2);
      const isDed = s.duration < 0 || s.type === "deduction";
      return `
                                    <tr style="${isDed ? "color: var(--accent-red);" : ""}">
                                        <td>${isDed ? getFormattedHebrewDate(s.start, "") : getFormattedHebrewDate(s.start, s.parsha)}</td>
                                        <td style="white-space: nowrap;">${isDed ? "הפחתה" : `${formatSimpleTime(s.start)} - ${formatSimpleTime(s.end)}`}</td>
                                        <td dir="ltr" style="text-align:right;">${formatDuration(s.duration)}</td>
                                        <td>₪${cost}</td>
                                        <td style="text-align:left; white-space: nowrap;">
                                            ${!isDed ? `<button class="btn-icon" style="display:inline-flex;" onclick="editSession('${c.id}', '${s.id}')"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button>` : ""}
                                            <button class="btn-icon" style="display:inline-flex; color: var(--accent-red);" onclick="deleteSession('${c.id}', '${s.id}')"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button>
                                        </td>
                                    </tr>`;
    })
    .join("");
}

function openOpenAdjustments() {
  renderOpenAdjustments();
  openModal("openAdjustmentsModal");
}

function renderOpenAdjustments() {
  const p = getActiveProject();
  if (!p) return;

  const tbody = document.getElementById("openAdjustmentsTableBody");
  const openAdjustments = p.adjustments.filter((a) => a.status === "open");
  openAdjustments.sort((a, b) => b.date - a.date);

  if (openAdjustments.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-muted);">אין תוספות או הפחתות פתוחות</td></tr>';
    return;
  }

  tbody.innerHTML = openAdjustments
    .map((a) => {
      const isNeg = a.amount < 0;
      return `
                                    <tr style="color:${isNeg ? "var(--accent-red)" : "inherit"};">
                                        <td>${a.reason}</td>
                                        <td dir="ltr" style="text-align:right; font-weight: 500;">${formatMoney(a.amount)}</td>
                                        <td style="text-align:left;"><button class="btn-icon" style="display:inline-flex; color: var(--accent-red);" onclick="deleteAdjustment('${a.id}')"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button></td>
                                    </tr>`;
    })
    .join("");
}

function refreshOpenModals() {
  if (
    document.getElementById("chapterSessionsModal")?.classList.contains("open")
  ) {
    const cid = (
      document.getElementById("currentViewChapterId") as HTMLInputElement
    ).value;
    if (cid) renderChapterSessions(cid);
  }
  if (
    document.getElementById("openAdjustmentsModal")?.classList.contains("open")
  ) {
    renderOpenAdjustments();
  }
}

function renderApp() {
  if (appData.currentView === "management") {
    renderManagementView();
  } else {
    renderMainContent();
  }
}

function switchToView(viewName) {
  const main = document.getElementById("mainContent");
  main.classList.add("view-hidden");
  setTimeout(() => {
    appData.currentView = viewName;
    renderApp();
    main.classList.remove("view-hidden");
  }, 200);
}

function renderManagementView() {
  const main = document.getElementById("mainContent");

  const activeProjects = appData.projects.filter((p) => !p.archived);
  const archivedProjects = appData.projects.filter((p) => p.archived);

  let allBatches = [];
  appData.projects.forEach((p) => {
    p.paymentBatches.forEach((b) => {
      allBatches.push({ ...b, projectId: p.id, projectName: p.name });
    });
  });
  allBatches.sort((a, b) => b.date - a.date);

  const getProjectFullStats = (project) => {
    let totalSec = 0;
    let openSec = 0;

    project.chapters.forEach((c) => {
      c.sessions.forEach((s) => {
        totalSec += s.duration;
        if (s.status === "open") openSec += s.duration;
      });
    });

    // הוספת זמן רץ כרגע אם קיים בפרויקט הזה
    if (
      appData.activeTimer.chapterId &&
      project.chapters.some((c) => c.id === appData.activeTimer.chapterId)
    ) {
      const runningDuration = Math.floor(
        (Date.now() - appData.activeTimer.startTime) / 1000,
      );
      totalSec += runningDuration;
      openSec += runningDuration;
    }

    let openAdjsTotal = 0;
    project.adjustments.forEach((a) => {
      if (a.status === "open") openAdjsTotal += a.amount;
    });

    const openHoursMoney = (openSec / 3600) * (project.rate || 0);
    const totalOpen = openHoursMoney + openAdjsTotal + (project.debt || 0);
    const totalPaid = project.paymentBatches.reduce(
      (sum, b) => sum + (b.actualPaid || 0),
      0,
    );

    return {
      hoursStr: formatDuration(totalSec),
      totalOpen: formatMoney(totalOpen),
      totalPaid: formatMoney(totalPaid),
      taskCount: project.chapters.length,
      invoiceCount: project.paymentBatches.length,
    };
  };

  const projectCardHtml = (p) => {
    const stats = getProjectFullStats(p);
    return `
                  <div class="batch-card" style="cursor: pointer; display: flex; flex-direction: column; gap: 15px;" onclick="selectProject('${p.id}'); switchToView('project');">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border); padding-bottom: 15px; gap: 10px;">
                          <div style="flex: 1; min-width: 0;">
                             <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                 <div style="font-size: 1.25rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
                                 <button class="btn-icon" onclick="event.stopPropagation(); toggleArchiveById('${p.id}')" title="${p.archived ? "החזר מארכיון" : "העבר לארכיון"}" style="padding: 4px; width: 28px; height: 28px; flex-shrink: 0;">
                                     <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-muted);">${p.archived ? "unarchive" : "inventory_2"}</span>
                                 </button>
                             </div>
                             <div style="font-size: 0.85rem; color: var(--text-muted);">תעריף: ₪${p.rate}/שעה</div>
                          </div>
                          <div dir="ltr" style="font-size: 1.6rem; font-weight: 300; color: var(--text-main); flex-shrink: 0;">${stats.hoursStr}</div>
                      </div>
                            <div style="display: flex; justify-content: space-between; background: var(--bg-body); padding: 12px; border-radius: var(--radius);">                          <div style="text-align: right;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px;">סה"כ שולם</div>
                                    <div style="font-weight: 500; font-size: 1.1rem; color: var(--accent-green);">${stats.totalPaid}</div>
                                </div>
                                <div style="text-align: left;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px;">פתוח לתשלום</div>
                                    <div style="font-weight: 500; font-size: 1.1rem; color: var(--text-main);">${stats.totalOpen}</div>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); padding-top: 5px;">
                                 <span style="display: flex; align-items: center; gap: 4px;"><span class="material-symbols-rounded" style="font-size: 16px;">task_alt</span> ${stats.taskCount} משימות</span>
                                 <span style="display: flex; align-items: center; gap: 4px;"><span class="material-symbols-rounded" style="font-size: 16px;">receipt_long</span> ${stats.invoiceCount} חשבוניות</span>
                            </div>
                        </div>
                    `;
  };

  let html = `
                  <header style="display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                      <div style="display: flex; align-items: flex-start; gap: 15px;">
                          <button class="btn-icon" onclick="switchToView('project')" title="חזרה לפרויקט הפעיל" style="font-size: 1.5rem; padding: 8px; margin-top: 2px;">
                              <span class="material-symbols-rounded" style="font-size: 28px;">arrow_forward</span>
                          </button>
                          <div>
                              <h1 style="font-size: 2.2rem; font-weight: 300; line-height: 1;">כל הפרויקטים והחשבוניות</h1>
                              <p style="color: var(--text-muted); margin-top: 8px;">מבט-על פיננסי וניהולי על כל העבודה שלך</p>
                          </div>
                      </div>
                      <button class="btn btn-outline" onclick="openModal('projectModal')" style="margin-top: 5px; border-radius: 30px; padding: 10px 24px;">
                          <span class="material-symbols-rounded">add</span> פרויקט חדש
                      </button>
                  </header>

                  <div class="section-title" style="margin-top: 40px;">פרויקטים פעילים (${activeProjects.length})</div>
                  <div class="batches-grid" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
                      ${activeProjects.map(projectCardHtml).join("")}
                      <div class="batch-card chapter-card-add" onclick="openModal('projectModal')" style="min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: none;">
                          <span class="material-symbols-rounded" style="font-size: 2.5rem; color: var(--text-muted);">add</span>
                          <div style="margin-top: 15px; font-size: 1.05rem; font-weight: 500; color: var(--text-muted);">הוסף פרויקט חדש</div>
                      </div>
                  </div>

                  <div class="section-title" style="margin-top: 50px;">פרויקטים בארכיון (${archivedProjects.length})</div>
                  <div class="batches-grid" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
                      ${archivedProjects.length > 0 ? archivedProjects.map(projectCardHtml).join("") : '<div style="color:var(--text-muted); font-weight: 300;">אין פרויקטים בארכיון.</div>'}
                  </div>

                  <div class="section-title" style="margin-top: 50px;">כל החשבוניות (${allBatches.length})</div>
                  <div class="batches-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
                      ${
                        allBatches.length > 0
                          ? allBatches
                              .map(
                                (b) => `
                          <div class="batch-card" onclick="openBatchDetails('${b.id}', '${b.projectId}')" style="display: flex; flex-direction: column; gap: 8px;">
                              <div style="display: flex; justify-content: space-between; align-items: center;">
                                  <span style="font-weight: 500; color: var(--text-main); font-size: 1.05rem;">${b.name}</span>
                                  <span class="material-symbols-rounded" style="color: var(--text-muted); font-size: 18px;">open_in_new</span>
                              </div>
                              <div style="font-size: 0.85rem; color: var(--text-muted);">
                                  <strong>${b.projectName}</strong> &nbsp;|&nbsp; ${new Date(b.date).toLocaleDateString("he-IL")}
                              </div>
                              <div dir="ltr" style="text-align:right; font-size: 1.4rem; font-weight: 300; color: var(--text-main); margin-top: 5px;">
                                  ${formatMoney(b.amount || 0)}
                              </div>
                          </div>
                      `,
                              )
                              .join("")
                          : '<div style="color:var(--text-muted); font-weight: 300;">טרם הופקו חשבוניות.</div>'
                      }
                  </div>
                  <div style="height: 100px;"></div>
                `;

  main.innerHTML = html;
}

function renderMainContent() {
  const main = document.getElementById("mainContent");
  const p = getActiveProject();
  if (!p) {
    main.innerHTML = `
                                    <div style="text-align:center;margin-top:15vh;color:var(--text-muted); display:flex; flex-direction:column; align-items:center;">
                                        <span class="material-symbols-rounded" style="font-size: 60px; color: var(--text-main); margin-bottom: 20px;">layers</span>
                                        <h2 style="font-weight: 300; font-size: 2rem; color: var(--text-main); margin-bottom: 30px;">ברוך הבא למערכת 'שעות זמניות'</h2>
                                        <button class="btn btn-primary" onclick="openModal('projectModal')" style="font-size: 1.1rem; padding: 14px 28px; margin-bottom: 20px;">צור את הפרויקט הראשון</button>
                                        <button class="btn btn-ghost" onclick="triggerImport()">שחזור מגיבוי</button>
                                    </div>`;
    return;
  }

  let totalOpenSec = 0;
  p.chapters.forEach((c) => {
    totalOpenSec += getChapterDuration(c.id, "open");
  });

  if (appData.activeTimer.chapterId) {
    totalOpenSec += Math.floor(
      (Date.now() - appData.activeTimer.startTime) / 1000,
    );
  }

  let openAdjsTotal = 0;
  p.adjustments.forEach((a) => {
    if (a.status === "open") openAdjsTotal += a.amount;
  });

  const hoursMoney = (totalOpenSec / 3600) * p.rate;
  const grandTotal = hoursMoney + openAdjsTotal + (p.debt || 0);

  let debtHtml = "";
  if (p.debt !== 0) {
    const clientOwesMe = p.debt > 0;
    debtHtml = `
                                    <div class="hub-item ${clientOwesMe ? "credit" : "debt"}" onclick="openDebtModal()" title="יתרה מתקופות קודמות (לחץ לעריכה)">
                                        <span class="hub-label">יתרת עבר ${clientOwesMe ? "(לקוח חייב)" : "(זכות ללקוח)"}</span>
                                        <span class="hub-value">${formatMoney(Math.abs(p.debt))}</span>
                                    </div>`;
  } else {
    debtHtml = `
                                    <div class="hub-item" onclick="openDebtModal()" title="אין יתרת עבר (לחץ לעריכה)">
                                        <span class="hub-label">יתרת עבר</span>
                                        <span class="hub-value" style="color: var(--border);">₪0.00</span>
                                    </div>`;
  }

  const activeProjects = appData.projects.filter((proj) => !proj.archived);
  const archivedProjects = appData.projects.filter((proj) => proj.archived);

  // חישוב התראות סנכרון וגיבוי
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const ONE_WEEK = 7 * ONE_DAY;
  const timeSinceSync = appData.lastSyncDate
    ? Date.now() - appData.lastSyncDate
    : 0;

  const isDriveDirty = appData.lastSyncDate && timeSinceSync > ONE_DAY;
  const isBackupCritical = appData.lastSyncDate && timeSinceSync > ONE_WEEK;

  const driveBtnStyle = isDriveDirty
    ? "color: var(--accent-red); position: relative;"
    : "color: var(--accent-blue);";
  const driveBadge = isDriveDirty
    ? `<span style="position:absolute; top:2px; right:2px; width:8px; height:8px; background:var(--accent-red); border-radius:50%; border:2px solid var(--bg-body);"></span>`
    : "";

  const backupBtnStyle = isBackupCritical
    ? "color: var(--accent-red); position: relative;"
    : "";
  const backupBadge = isBackupCritical
    ? `<span style="position:absolute; top:2px; right:2px; width:8px; height:8px; background:var(--accent-red); border-radius:50%; border:2px solid var(--bg-body);"></span>`
    : "";

  // איסוף זריז של חשבוניות לטובת התצוגה המקדימה
  let allBatchesPreview = [];

  appData.projects.forEach((proj) => {
    proj.paymentBatches.forEach((b) => {
      allBatchesPreview.push({ ...b, projectName: proj.name });
    });
  });
  allBatchesPreview.sort((a, b) => b.date - a.date);

  // פונקציית עזר לחישוב נתונים למיני-כרטיסים
  const getMicroStats = (proj) => {
    let openSec = 0;
    proj.chapters.forEach((c) =>
      c.sessions.forEach((s) => {
        if (s.status === "open") openSec += s.duration;
      }),
    );
    if (
      appData.activeTimer.chapterId &&
      proj.chapters.some((c) => c.id === appData.activeTimer.chapterId)
    ) {
      openSec += Math.floor(
        (Date.now() - appData.activeTimer.startTime) / 1000,
      );
    }
    let adjs = 0;
    proj.adjustments.forEach((a) => {
      if (a.status === "open") adjs += a.amount;
    });
    let totalOpen =
      (openSec / 3600) * (proj.rate || 0) + adjs + (proj.debt || 0);
    let totalPaid = proj.paymentBatches.reduce(
      (sum, b) => sum + (b.actualPaid || 0),
      0,
    );
    return { open: formatMoney(totalOpen), paid: formatMoney(totalPaid) };
  };

  let dropdownHtml =
    `<div style="padding: 8px 16px; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); background: var(--bg-body);">פרויקטים פעילים</div>` +
    activeProjects
      .map(
        (proj) => `
                  <div class="dropdown-item ${proj.id === appData.activeProjectId ? "active" : ""}" onclick="selectProject('${proj.id}')">
                      <span>${proj.name}</span>
                      ${proj.id === appData.activeProjectId ? '<span class="material-symbols-rounded">check</span>' : ""}
                  </div>`,
      )
      .join("");

  if (archivedProjects.length > 0) {
    dropdownHtml += `<div style="padding: 8px 16px; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); background: var(--bg-body); border-top: 1px solid var(--border);">בארכיון</div>`;
    dropdownHtml += archivedProjects
      .map(
        (proj) => `
                                    <div class="dropdown-item ${proj.id === appData.activeProjectId ? "active" : ""}" style="opacity: 0.6;" onclick="selectProject('${proj.id}')">
                                        <span>${proj.name}</span>
                                    </div>`,
      )
      .join("");
  }

  dropdownHtml += `
                                    <div class="dropdown-item dropdown-add-btn" onclick="openModal('projectModal')">
                                        <span class="material-symbols-rounded">add</span> פרויקט חדש
                                    </div>`;

  let archivedBanner = "";
  if (p.archived) {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    archivedBanner = `
                                    <div style="background: ${isDark ? "rgba(245, 158, 11, 0.1)" : "#fffbeb"}; color: ${isDark ? "#fbbf24" : "#b45309"}; padding: 12px 20px; border-radius: var(--radius); border: 1px solid ${isDark ? "rgba(245, 158, 11, 0.2)" : "#fde68a"}; margin-bottom: 25px; display: flex; align-items: center; gap: 10px;">
                                        <span class="material-symbols-rounded">inventory_2</span>
                                        <span><strong>פרויקט זה נמצא בארכיון.</strong> הוא מוסתר מהרשימה הראשית. ניתן להחזיר אותו לפעילות דרך מסך ההגדרות.</span>
                                    </div>`;
  }

  let html = `
                                    <header style="align-items: flex-start;">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <div class="project-dropdown" id="projectDropdown">
                                    <div class="dropdown-trigger" onclick="toggleProjectMenu()">
                                        ${p.name}
                                        <span class="material-symbols-rounded dropdown-icon">expand_more</span>
                                    </div>
      <div class="dropdown-wrapper">
                                  <div class="dropdown-menu">
                                      ${dropdownHtml}
                                  </div>
                                  <div class="management-preview" onclick="switchToView('management')" title="לתצוגת כל הפרויקטים והחשבוניות">
                                      <div class="preview-header">
                                          <span class="material-symbols-rounded">dashboard</span>
                                          <span>לכל הפרויקטים והחשבוניות</span>
                                      </div>
                                      <div class="micro-app-preview">
                                          <div class="micro-header">ניהול כללי</div>

                                          <div class="micro-section-title">פרויקטים פעילים (${activeProjects.length})</div>
                                          <div class="micro-grid">
                                              ${
                                                activeProjects
                                                  .slice(0, 4)
                                                  .map((proj) => {
                                                    const st =
                                                      getMicroStats(proj);
                                                    return `
                                                  <div class="micro-card">
                                                      <div class="micro-card-top">
                                                          <span class="micro-card-title">${proj.name}</span>
                                                      </div>
                                                      <div class="micro-card-bottom">
                                                          <div class="micro-card-bottom-col">
                                                              <span style="color:var(--text-muted)">שולם</span>
                                                              <span class="micro-card-bottom-val" style="color:var(--accent-green)">${st.paid}</span>
                                                          </div>
                                                          <div class="micro-card-bottom-col" style="text-align:left">
                                                              <span style="color:var(--text-muted)">פתוח</span>
                                                              <span class="micro-card-bottom-val">${st.open}</span>
                                                          </div>
                                                      </div>
                                                  </div>`;
                                                  })
                                                  .join("") ||
                                                `<div style="font-size: 8px; color: var(--text-muted); grid-column: 1/-1;">אין פרויקטים</div>`
                                              }
                                          </div>

                                          <div class="micro-section-title">כל החשבוניות (${allBatchesPreview.length})</div>
                                          <div class="micro-grid">
                                              ${
                                                allBatchesPreview
                                                  .slice(0, 2)
                                                  .map(
                                                    (b) => `
                                                  <div class="micro-card">
                                                      <div class="micro-card-top">
                                                          <span class="micro-card-title">${b.name}</span>
                                                      </div>
                                                      <div class="micro-card-top" style="margin-top: 2px;">
                                                          <span class="micro-card-badge">${b.projectName}</span>
                                                          <span class="micro-card-bottom-val">${formatMoney(b.amount || 0)}</span>
                                                      </div>
                                                  </div>
                                              `,
                                                  )
                                                  .join("") ||
                                                `<div style="font-size: 8px; color: var(--text-muted); grid-column: 1/-1;">אין חשבוניות</div>`
                                              }
                                          </div>
                                      </div>
                                  </div>
                              </div>                          </div>
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <span style="font-size: 0.95rem; color: var(--text-muted);">תעריף: <strong style="color: var(--text-main); font-weight: 500;">${p.rate}</strong> ₪ לשעה</span>
                                    <div class="rate-text-btn" onclick="openProjectSettingsModal()" title="הגדרות פרויקט וארכיון" style="font-size: 0.85rem; padding: 4px 8px;">
                                        <span class="material-symbols-rounded" style="font-size: 16px; margin-left: 4px;">tune</span> הגדרות פרויקט
                                    </div>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 12px;">
                                            <div style="display: flex; gap: 4px;">
                                                <button class="btn btn-ghost" onclick="openAnalyticsModal()" title="סטטיסטיקה (7 ימים)"><span class="material-symbols-rounded">bar_chart</span></button>
                                                <button class="btn btn-ghost" onclick="toggleTheme()" title="מצב לילה/יום">
                                                    <span class="material-symbols-rounded">${document.documentElement.getAttribute("data-theme") === "dark" ? "light_mode" : "dark_mode"}</span>
                                                </button>
            <div style="width: 1px; background: var(--border); margin: 0 8px;"></div>
                                    <button class="btn btn-ghost" onclick="openDriveSyncModal()" title="סנכרון לענן (Google Drive)" style="${driveBtnStyle}">
                                        <span class="material-symbols-rounded">cloud</span>
                                        ${driveBadge}
                                    </button>
                                    <button class="btn btn-ghost" onclick="downloadBackup()" title="הורדת קובץ גיבוי למחשב" style="${backupBtnStyle}">
                                        <span class="material-symbols-rounded">download</span>
                                        ${backupBadge}
                                    </button>                                    
                                    <button class="btn btn-ghost" onclick="triggerImport()" title="שחזור מקובץ"><span class="material-symbols-rounded">upload</span></button>
                                            </div>
                        <div id="dailyTotalDisplay" onclick="openGoalModal()" title="לחץ להגדרת יעד">
                                                <!-- מרונדר לייב ע"י הפונקציה -->
                                            </div>
                                        </div>
                                    </header>

                                    ${archivedBanner}

                                    <div class="financial-hub">                <div class="hub-item" title="סך הכל שעות עבודה שאושרו טרם שולמו">
                                            <span class="hub-label">עבודה (${formatDuration(totalOpenSec)})</span>
                                            <span class="hub-value">${formatMoney(hoursMoney)}</span>
                                        </div>

                                        <div class="hub-divider"></div>

                                        <div class="hub-item ${openAdjsTotal !== 0 ? (openAdjsTotal > 0 ? "credit" : "debt") : ""}" onclick="openOpenAdjustments()" title="תוספות (נסיעות/בונוס) או הפחתות. לחץ לניהול">
                                            <span class="hub-label">תוספות והפחתות</span>
                                            <span class="hub-value">${formatMoney(Math.abs(openAdjsTotal))}</span>
                                        </div>

                                        <div class="hub-divider"></div>

                                        ${debtHtml}

                                        <div class="hub-total-section">
                                            <div class="hub-total-info">
                                                <span class="hub-total-label">סה"כ לתשלום</span>
                                                <span class="hub-total-value">${formatMoney(grandTotal)}</span>
                                            </div>
                                        </div>

                                        <button class="btn btn-primary" style="padding: 16px 32px; font-size: 1.1rem; border-radius: 30px;" onclick="openGlobalPaymentModal()">
                                            סגירת תקופה
                                        </button>
                                    </div>

                                    <div class="chapters-grid">
                                        ${p.chapters
                                          .map((ch) => {
                                            const isActive =
                                              appData.activeTimer.chapterId ===
                                              ch.id;
                                            let sessionDiff = isActive
                                              ? Math.floor(
                                                  (Date.now() -
                                                    appData.activeTimer
                                                      .startTime) /
                                                    1000,
                                                )
                                              : 0;
                                            let totalOpenSec =
                                              getChapterDuration(
                                                ch.id,
                                                "open",
                                              ) + sessionDiff;
                                            let mainDisplaySec = isActive
                                              ? sessionDiff
                                              : totalOpenSec;

                                            return `
                                                <div class="chapter-card ${isActive ? "active-timer" : ""}" style="cursor:pointer;" onclick="${isActive ? "restoreFocusOverlay()" : `openChapterSessions('${ch.id}')`}" title="${isActive ? "הצג חלון מיקוד" : "לחץ לפירוט השעות"}">
                                                    <div class="card-top" onclick="event.stopPropagation()">
                                                        <input class="chapter-name-input" value="${ch.name}" onchange="updateChapterName('${ch.id}', this.value)" onclick="event.stopPropagation()">
                                                        <button class="btn-icon" onclick="deleteChapter('${ch.id}'); event.stopPropagation();" title="מחק משימה">
                                                            <span class="material-symbols-rounded" style="font-size: 18px;">delete_outline</span>
                                                        </button>
                                                    </div>
                                                    <div style="display: flex; flex-direction: column;">
                                                        <div class="chapter-total-time" id="timer-total-${ch.id}" style="${isActive ? "" : "display: none;"}">${formatDuration(totalOpenSec)}</div>
                                                        <div class="timer-display" id="timer-${ch.id}">${formatDuration(mainDisplaySec)}</div>
                                                    </div>
                                                    <div class="card-controls" onclick="event.stopPropagation()">
                                                        <button class="btn flex-1 ${isActive ? "btn-stop" : "btn-outline"}" onclick="toggleTimer('${ch.id}')">
                                                            ${isActive ? "עצור זמנים" : "התחל שעות"}
                                                        </button>
                                                        <button class="btn btn-ghost" onclick="openDeductionModal('${ch.id}', '${ch.name}')" title="הפחת דקות (למשל: הפסקת אוכל)">
                                                            <span class="material-symbols-rounded" style="font-size: 20px;">timer_off</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            `;
                                          })
                                          .join("")}
                                        <div class="chapter-card chapter-card-add" onclick="openModal('chapterModal')">
                                            <span class="material-symbols-rounded" style="font-size: 2rem;">add</span>
                                            <div style="margin-top: 10px; font-size: 0.95rem;">הוסף משימה</div>
                                        </div>
                                    </div>

                                    <div class="section-title" style="margin-top: 60px;">ארכיון חשבוניות מפרויקט נוכחי</div>
                                    <div class="batches-grid">
                                        ${
                                          p.paymentBatches.length > 0
                                            ? p.paymentBatches
                                                .slice()
                                                .reverse()
                                                .map((b) => {
                                                  const chapterNamesInBatch = [
                                                    ...new Set(
                                                      p.chapters.flatMap((c) =>
                                                        c.sessions
                                                          .filter(
                                                            (s) =>
                                                              s.batchId ===
                                                              b.id,
                                                          )
                                                          .map((s) => c.name),
                                                      ),
                                                    ),
                                                  ];
                                                  const chaptersString =
                                                    chapterNamesInBatch.join(
                                                      " / ",
                                                    );

                                                  return `
                                                <div class="batch-card" onclick="openBatchDetails('${b.id}', '${p.id}')">
                                                    <div class="batch-header">
                                                        <input type="text" value="${b.name}" class="chapter-name-input" onclick="event.stopPropagation()" onchange="updateBatchName('${b.id}', this.value)" style="width:80%;">
                                                        <button class="btn-icon" onclick="event.stopPropagation(); deleteBatch('${b.id}')"><span class="material-symbols-rounded">delete_outline</span></button>
                                                    </div>
                                                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">נסגר ב: ${new Date(b.date).toLocaleDateString("he-IL")}</div>
                                                    ${chaptersString ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${chaptersString}"><span class="material-symbols-rounded" style="font-size: 14px;">checklist</span> ${chaptersString}</div>` : ""}
                                                    <div class="batch-total" dir="ltr" style="text-align:right;">${formatMoney(b.amount || 0)}</div>
                                                    <div style="font-size: 0.9rem; color: var(--text-muted); display:flex; justify-content:space-between;">
                                                        <span>שולם בפועל:</span>
                                                        <strong dir="ltr">${formatMoney(b.actualPaid || 0)}</strong>
                                                    </div>
                                                </div>
                                              `;
                                                })
                                                .join("")
                                            : '<div style="color:var(--text-muted); font-weight: 300;">טרם בוצעו סגירות חודש בפרויקט זה.</div>'
                                        }
                                    </div>
                                    <div style="height: 100px;"></div>
                        `;
  main.innerHTML = html;
  refreshOpenModals();
  updateDashboardRealtime(); // עדכון מיידי של פס ההתקדמות והשעות ברגע שהמסך נטען
}
function openModal(id: string) {
  document.getElementById(id)!.classList.add("open");
  const inp = document
    .getElementById(id)!
    .querySelector("input:not([type=hidden])");
  if (inp) setTimeout(() => (inp as HTMLElement).focus(), 100);
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
window.onclick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (
    target &&
    target.classList &&
    target.classList.contains("modal-overlay")
  ) {
    // אל תסגור את חלון תנאי השימוש בלחיצה בחוץ, חובה ללחוץ על "אני מאשר"
    if (target.id !== "tosModal") {
      target.classList.remove("open");
    }
  }
};

// --- קיצורי מקלדת (רווח ו-Insert) וחיווי כרטיסייה ---

// פונקציה לעדכון כותרת הכרטיסייה למעלה
function updateTabTitle() {
  const p = getActiveProject();
  const isRunning = appData.activeTimer.chapterId !== null;

  if (isRunning) {
    // זמן ההפעלה הנוכחית
    const sessionDiff = Math.floor(
      (Date.now() - appData.activeTimer.startTime) / 1000,
    );

    // שימוש בתו LTR (Left-To-Right) לטיימר כדי שהספרות לא יקפצו
    const LTR = "\u202A";
    document.title = `${LTR}${formatDuration(sessionDiff)}`;
  } else {
    // תו RTL לשם הפרויקט בעברית
    const RTL = "\u202B";
    // הצגת שם הפרויקט בלבד למניעת כפילות מול שם האפליקציה ב-PWA
    let title = p ? p.name : "שעות זמניות";
    document.title = `${RTL}${title}`;
  }
}

// האזנה ללחיצות מקלדת
document.addEventListener("keydown", function (event) {
  // אם המשתמש כרגע מקליד בתוך שדה טקסט כלשהו (כמו שם משימה או סכום), אל תפעיל את הקיצור
  const target = event.target as HTMLElement;
  if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

  // אם נלחץ מקש רווח או Insert
  if (event.code === "Space" || event.code === "Insert") {
    event.preventDefault(); // מונע מהדף לגלול למטה בלחיצה על רווח

    const p = getActiveProject();
    if (p && p.chapters && p.chapters.length > 0) {
      // בחירת המשימה האחרון ברשימה
      const lastChapter = p.chapters[p.chapters.length - 1];
      // הפעלה או עצירה של הטיימר למשימה זה
      toggleTimer(lastChapter.id);
    }
  }
});

// --- מערכת הדפסה ולוגו ---

let currentPrintData = null;

function openPrintFromArchive() {
  closeModal("archiveModal");
  currentPrintData = {
    title: "פירוט חשבון",
    batchName: archiveModalState.batchName,
    projectName: archiveModalState.projectName,
    rate: archiveModalState.rate,
    items: archiveModalState.items,
    vatEnabled: archiveModalState.vatEnabled,
    vatAmount: archiveModalState.vatAmount,
    totalAmount:
      archiveModalState.totalAmount + (archiveModalState.vatAmount || 0),
    actualPaid: archiveModalState.actualPaid,
  };
  openPrintSettings();
}

function openPrintFromGlobal() {
  closeModal("globalPaymentModal");
  const p = getActiveProject();

  let items = [];

  // המרת שעות פתוחות למבנה הדפסה
  globalPaymentData.openSessions.forEach((os) => {
    const c = p.chapters.find((ch) => ch.id === os.chapterId);
    items.push({ type: "time", obj: os, chapterName: c ? c.name : "" });
  });

  // המרת תוספות פתוחות למבנה הדפסה
  globalPaymentData.openAdjustments.forEach((oa) => {
    items.push({ type: "money", obj: oa });
  });

  // טיפול ביתרת עבר - הוספה כשורה כספית כדי שיופיע בטבלה
  if (globalPaymentData.currentDebt !== 0) {
    items.push({
      type: "money",
      obj: {
        reason: "יתרת עבר מתקופות קודמות (חוב/זכות)",
        amount: globalPaymentData.currentDebt,
        date: Date.now() + 1,
      },
    });
  }

  // מיון לפי תאריך יורד
  items.sort((a, b) => {
    const tsA = a.type === "time" ? a.obj.start : a.obj.date;
    const tsB = b.type === "time" ? b.obj.start : b.obj.date;
    return tsB - tsA;
  });

  currentPrintData = {
    title: "דרישת תשלום",
    batchName: `תקופת פעילות עד ${new Date().toLocaleDateString("he-IL")}`,
    projectName: p.name,
    rate: p.rate,
    items: items,
    vatEnabled: !!p.vatEnabled,
    vatAmount: globalPaymentData.vatAmount || 0,
    totalAmount: globalPaymentData.grandTotal,
    actualPaid: 0, // אין עדיין תשלום בפועל לדרישה פתוחה
  };

  openPrintSettings();
}

function openPrintSettings() {
  const logoContainer = document.getElementById("printLogoPreviewContainer");
  const logoPreview = document.getElementById(
    "printLogoPreview",
  ) as HTMLImageElement;

  if (appData.invoiceLogo) {
    logoPreview.src = appData.invoiceLogo;
    if (logoContainer) logoContainer.style.display = "block";
  } else {
    if (logoContainer) logoContainer.style.display = "none";
    logoPreview.src = "";
  }
  openModal("printSettingsModal");
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert("קובץ הלוגו גדול מדי. אנא העלה תמונה עד 2MB.");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e: any) {
    appData.invoiceLogo = e.target.result as string;
    saveData();
    (document.getElementById("printLogoPreview") as HTMLImageElement).src =
      appData.invoiceLogo;
    (
      document.getElementById("printLogoPreviewContainer") as HTMLElement
    ).style.display = "block";
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function removePrintLogo() {
  delete appData.invoiceLogo;
  saveData();
  (document.getElementById("printLogoPreview") as HTMLImageElement).src = "";
  (
    document.getElementById("printLogoPreviewContainer") as HTMLElement
  ).style.display = "none";
}

function executePrint() {
  const includeDetails = (
    document.getElementById("printIncludeDetails") as HTMLInputElement
  ).checked;
  const printArea = document.getElementById("printArea");
  const state = currentPrintData; // שואב מהמצב הכללי, תלוי מאיפה פתחנו

  let logoHtml = appData.invoiceLogo
    ? `<div class="print-logo"><img src="${appData.invoiceLogo}" /></div>`
    : "<div></div>";

  let detailsHtml = "";
  if (includeDetails) {
    let rows = "";
    state.items.forEach((item) => {
      if (item.type === "time") {
        const cost = ((item.obj.duration / 3600) * state.rate).toFixed(2);
        rows += `
                          <tr>
                              <td>${item.chapterName}</td>
                              <td>${getFormattedHebrewDate(item.obj.start, item.obj.parsha)}</td>
                              <td dir="ltr" style="text-align:right;">${formatDuration(item.obj.duration)}</td>
                              <td dir="ltr" style="text-align:right;">₪${cost}</td>
                          </tr>
                      `;
      } else {
        rows += `
                          <tr>
                              <td colspan="3">${item.obj.reason}</td>
                              <td dir="ltr" style="text-align:right; color: ${item.obj.amount < 0 ? "#dc2626" : "inherit"};">₪${item.obj.amount.toFixed(2)}</td>
                          </tr>
                      `;
      }
    });

    detailsHtml = `
                  <table class="print-table">
                      <thead>
                          <tr>
                              <th>תיאור / פעילות</th>
                              <th>תאריך</th>
                              <th>משך זמן</th>
                              <th>סכום</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${rows}
                      </tbody>
                  </table>
              `;
  }

  let subTotalHtml = "";
  if (state.vatEnabled) {
    const subTotal = state.totalAmount - state.vatAmount;
    subTotalHtml = `
              <div style="display: flex; justify-content: space-between; font-size: 1.1rem; color: #555; margin-bottom: 8px;">
                  <span>סכום ביניים:</span>
                  <span dir="ltr">₪${subTotal.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 1.1rem; color: #555; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
                  <span>מע"מ (18%):</span>
                  <span dir="ltr">₪${state.vatAmount.toFixed(2)}</span>
              </div>
          `;
  }

  const debtRowHtml =
    state.actualPaid > 0
      ? `
              <div class="print-paid-row">
                  <span>שולם בפועל:</span>
                  <span dir="ltr">₪${state.actualPaid.toFixed(2)}</span>
              </div>
          `
      : "";

  printArea.innerHTML = `
              <div class="print-header">
                  <div class="print-title-area">
                      <div class="print-title">${state.title}</div>
                      <div class="print-meta">תאריך הפקה: ${new Date().toLocaleDateString("he-IL")}</div>
                      <div class="print-meta">עבור: ${state.batchName}</div>
                  </div>
                  ${logoHtml}
              </div>

              <div class="print-project">פרויקט: <strong>${state.projectName}</strong></div>

              ${detailsHtml}

              <div class="print-total-box" style="display: block;">
                  ${subTotalHtml}
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div class="print-total-label">סה"כ לתשלום</div>
                      <div>
                          <div class="print-total-val" dir="ltr">₪${state.totalAmount.toFixed(2)}</div>
                      </div>
                  </div>
                  ${debtRowHtml}
              </div>
          `;

  closeModal("printSettingsModal");

  setTimeout(() => {
    window.print();
  }, 300);
}

init();

// --- קישור הפונקציות לממשק המשתמש (HTML) ---
Object.assign(window, {
  acceptTos, // <--- הוסף את השורה הזו
  handleFileImport,
  minimizeFocusOverlay,
  removePrintLogo,
  handleLogoUpload,
  executePrint,
  closeModal,
  addProject,
  addChapter,
  saveFinancialAdjustment,
  confirmGlobalPayment,
  openPrintFromGlobal,
  addDeduction,
  openAdjustmentModal,
  saveSessionEdit,
  toggleProjectArchive,
  saveProjectSettings,
  saveDebtModal,
  saveGoalModal,
  openPrintFromArchive,
  updateChapterName,
  toggleTimer,
  stopTimer,
  openDeductionModal,
  editSession,
  deleteSession,
  deleteChapter,
  selectProject,
  switchToView,
  openModal,
  toggleProjectMenu,
  openChapterSessions,
  openOpenAdjustments,
  deleteAdjustment,
  openBatchDetails,
  updateBatchName,
  deleteBatch,
  openAnalyticsModal,
  toggleTheme,
  openDriveSyncModal,
  downloadBackup,
  triggerImport,
  openGoalModal,
  openDebtModal,
  openGlobalPaymentModal,
  openProjectSettingsModal,
  renderArchiveTable,
  performRealDriveSync,
});
