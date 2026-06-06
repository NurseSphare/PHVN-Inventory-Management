/**

 * PHDU Critical Items — append rows to the responses sheet.

 *

 * Deploy once:

 * 1. Open the spreadsheet → Extensions → Apps Script

 * 2. Paste this file → Deploy → New deployment → Web app

 * 3. Execute as: Me | Who has access: Anyone

 * 4. Copy the Web app URL into DashBoard.html → GOOGLE_SHEET_CONFIG.submitWebAppUrl

 */



var SPREADSHEET_ID = '15N8UsOF6LdAz21pV3pqikypnREumPK_oredz108umoY';

var SHEET_GID = 1822273174;

var TRACH_DASHBOARD_GID = 239276680;



function doGet(e) {

  e = e || {};

  var action = e.parameter && e.parameter.action;

  if (action === 'trachImages') {

    return jsonResponse({ ok: true, images: getTrachDashboardImages_() });

  }

  return jsonResponse({ ok: true, message: 'PHDU inventory submit endpoint ready' });

}



function doPost(e) {

  try {

    var payload = parseRequestBody_(e);

    appendInventoryRow_(payload);

    return jsonResponse({ ok: true });

  } catch (err) {

    return jsonResponse({ ok: false, error: String(err.message || err) });

  }

}



function parseRequestBody_(e) {

  if (e.postData && e.postData.contents) {

    return JSON.parse(e.postData.contents);

  }

  if (e.parameter && e.parameter.payload) {

    return JSON.parse(e.parameter.payload);

  }

  return e.parameter || {};

}



function getSheetByGid_(ss, gid) {

  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {

    if (sheets[i].getSheetId() === gid) {

      return sheets[i];

    }

  }

  return null;

}



function getBlockTitleColumn_(col) {

  if (col <= 3) return 2;

  if (col <= 6) return 5;

  if (col <= 9) return 8;

  return 11;

}



function slugifyTrachTitle_(title) {

  return String(title || '').toLowerCase()

    .replace(/tracheostomy/gi, 'trach')

    .replace(/[^a-z0-9]+/g, '-')

    .replace(/^-|-$/g, '') || 'trach-item';

}



function findTrachTitleForImage_(sheet, anchor) {

  var titleCol = getBlockTitleColumn_(anchor.getColumn());

  for (var r = anchor.getRow(); r >= Math.max(1, anchor.getRow() - 8); r--) {

    var val = sheet.getRange(r, titleCol).getValue();

    if (String(val).toLowerCase().indexOf('tracheostomy') !== -1) {

      return String(val);

    }

  }

  return '';

}



function getTrachDashboardImages_() {

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheet = getSheetByGid_(ss, TRACH_DASHBOARD_GID);

  if (!sheet) return {};



  var images = sheet.getImages();

  var map = {};

  images.forEach(function(img) {

    var anchor = img.getAnchorCell();

    var title = findTrachTitleForImage_(sheet, anchor);

    if (!title) return;

    var slug = slugifyTrachTitle_(title);

    map[slug] = 'data:image/png;base64,' + Utilities.base64Encode(img.getBlob().getBytes());

  });

  return map;

}



function appendInventoryRow_(payload) {

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var sheet = getSheetByGid_(ss, SHEET_GID);

  if (!sheet) {

    sheet = ss.getSheets()[0];

  }



  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var row = headers.map(function(header) {

    var key = String(header);

    if (Object.prototype.hasOwnProperty.call(payload, key)) {

      return payload[key];

    }

    var trimmed = key.trim();

    if (Object.prototype.hasOwnProperty.call(payload, trimmed)) {

      return payload[trimmed];

    }

    return '';

  });



  if (!row[0]) {

    row[0] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  }



  sheet.appendRow(row);

}



function jsonResponse(obj) {

  return ContentService.createTextOutput(JSON.stringify(obj))

    .setMimeType(ContentService.MimeType.JSON);

}


