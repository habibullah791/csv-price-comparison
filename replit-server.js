const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

const EXCLUDED_COLUMNS = [
  'House Type',
  'Type',
  'Name',
  'First Floor Balustrade',
  'Ceiling Height',
  'Risers',
  'Stair Stain Data',
  'Balustrade Stain Data'
];

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];

      if (char === '"') {
        if (inQuotes && lines[i][j + 1] === '"') {
          currentValue += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index].replace(/^"|"$/g, '');
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseNumericValue(value) {
  if (!value || value === 'POA' || value === '' || value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function calculateDifference(value1, value2, firstLabel = 'File 1', secondLabel = 'File 2') {
  const num1 = parseNumericValue(value1);
  const num2 = parseNumericValue(value2);

  if (num1 === null && num2 === null) {
    return 'POA';
  }
  if (num1 === null) {
    return `Missing in ${firstLabel} (${secondLabel}: ${value2})`;
  }
  if (num2 === null) {
    return `Missing in ${secondLabel} (${firstLabel}: ${value1})`;
  }

  const diff = num1 - num2;
  return diff.toFixed(2);
}

function matchRows(row1, row2, keyColumns) {
  for (const keyCol of keyColumns) {
    if (row1[keyCol] !== row2[keyCol]) {
      return false;
    }
  }
  return true;
}

function parseTimestampFromFilename(filename) {
  const basename = path.basename(filename, '.csv');

  const patternUnderscore = /^(\d+)-([A-Za-z]+)-(\d+)-(\d{2})_(\d{2})_(\d{2})-/;
  const patternHyphen = /^(\d+)-([A-Za-z]+)-(\d+)-(\d{2})-(\d{2})-(\d{2})-/;
  const match = basename.match(patternUnderscore) || basename.match(patternHyphen);

  if (!match) {
    return null;
  }

  const [, day, monthName, year, hours, minutes, seconds] = match;

  const monthMap = {
    'January': 0, 'February': 1, 'March': 2, 'April': 3,
    'May': 4, 'June': 5, 'July': 6, 'August': 7,
    'September': 8, 'October': 9, 'November': 10, 'December': 11
  };

  const month = monthMap[monthName];
  if (month === undefined) {
    return null;
  }

  const date = new Date(
    parseInt(year),
    month,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds)
  );

  return date.getTime();
}

function extractCustomerNameFromFilename(filename) {
  const basename = path.basename(filename, '.csv');
  const patternUnderscore = /-\d{2}_\d{2}_\d{2}-(.+)-price-testing$/;
  const patternHyphen = /-\d{2}-\d{2}-\d{2}-(.+)-price-testing$/;
  const match = basename.match(patternUnderscore) || basename.match(patternHyphen);
  return match ? match[1] : 'Unknown';
}

function generateOutputFilename(file1Name, file2Name) {
  const customerName = extractCustomerNameFromFilename(file1Name) || extractCustomerNameFromFilename(file2Name) || 'Unknown';
  const now = new Date();
  const day = now.getDate();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${day}-${monthName}-${year}-${hours}_${minutes}_${seconds}-${customerName}-comparison.csv`;
}

function determineFileOrder(file1Name, file2Name) {
  const timestamp1 = parseTimestampFromFilename(file1Name);
  const timestamp2 = parseTimestampFromFilename(file2Name);

  if (timestamp1 === null && timestamp2 === null) {
    return { firstFile: file1Name, secondFile: file2Name, firstLabel: 'File 1', secondLabel: 'File 2' };
  }

  if (timestamp1 === null || timestamp2 === null) {
    return { firstFile: file1Name, secondFile: file2Name, firstLabel: 'File 1', secondLabel: 'File 2' };
  }

  if (timestamp1 <= timestamp2) {
    return { firstFile: file1Name, secondFile: file2Name, firstLabel: 'File 1 (Older)', secondLabel: 'File 2 (Newer)' };
  } else {
    return { firstFile: file2Name, secondFile: file1Name, firstLabel: 'File 1 (Older)', secondLabel: 'File 2 (Newer)' };
  }
}

function compareCSVFiles(file1Content, file2Content, file1Name, file2Name) {
  const file1 = parseCSV(file1Content);
  const file2 = parseCSV(file2Content);

  if (file1.headers.length === 0 || file2.headers.length === 0) {
    throw new Error('One or both CSV files are empty or invalid');
  }

  const { firstLabel, secondLabel } = determineFileOrder(file1Name, file2Name);
  const firstFile = file1Name === determineFileOrder(file1Name, file2Name).firstFile ? file1 : file2;
  const secondFile = file1Name === determineFileOrder(file1Name, file2Name).firstFile ? file2 : file1;

  const keyColumns = ['House Type', 'Type', 'Name'];
  const allHeaders = [...new Set([...file1.headers, ...file2.headers])];

  const comparisonHeaders = [];
  const excludedHeaders = [];

  allHeaders.forEach(header => {
    if (EXCLUDED_COLUMNS.includes(header)) {
      excludedHeaders.push(header);
    } else {
      comparisonHeaders.push(header);
    }
  });

  const outputHeaders = [];

  excludedHeaders.forEach(header => {
    if (file1.headers.includes(header)) {
      outputHeaders.push(header);
    }
  });

  comparisonHeaders.forEach(header => {
    outputHeaders.push(`${header} (${firstLabel})`);
    outputHeaders.push(`${header} (${secondLabel})`);
    outputHeaders.push(`${header} (Difference)`);
  });

  const comparisonRows = [];

  for (const row1 of firstFile.rows) {
    const matchingRow2 = secondFile.rows.find(row2 => matchRows(row1, row2, keyColumns));

    if (matchingRow2) {
      const comparisonRow = {};

      excludedHeaders.forEach(header => {
        comparisonRow[header] = row1[header] || '';
      });

      comparisonHeaders.forEach(header => {
        const value1 = row1[header] || '';
        const value2 = matchingRow2[header] || '';
        const difference = calculateDifference(value1, value2, firstLabel, secondLabel);

        comparisonRow[`${header} (${firstLabel})`] = value1;
        comparisonRow[`${header} (${secondLabel})`] = value2;
        comparisonRow[`${header} (Difference)`] = difference;
      });

      comparisonRows.push(comparisonRow);
    } else {
      const comparisonRow = {};

      excludedHeaders.forEach(header => {
        comparisonRow[header] = row1[header] || '';
      });

      comparisonHeaders.forEach(header => {
        const value1 = row1[header] || '';
        comparisonRow[`${header} (${firstLabel})`] = value1;
        comparisonRow[`${header} (${secondLabel})`] = 'Not Found';
        comparisonRow[`${header} (Difference)`] = 'Not Found';
      });

      comparisonRows.push(comparisonRow);
    }
  }

  for (const row2 of secondFile.rows) {
    const existsInFile1 = firstFile.rows.some(row1 => matchRows(row1, row2, keyColumns));

    if (!existsInFile1) {
      const comparisonRow = {};

      excludedHeaders.forEach(header => {
        comparisonRow[header] = row2[header] || '';
      });

      comparisonHeaders.forEach(header => {
        const value2 = row2[header] || '';
        comparisonRow[`${header} (${firstLabel})`] = 'Not Found';
        comparisonRow[`${header} (${secondLabel})`] = value2;
        comparisonRow[`${header} (Difference)`] = 'Not Found';
      });

      comparisonRows.push(comparisonRow);
    }
  }

  const csvRows = [outputHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

  comparisonRows.forEach(row => {
    const values = outputHeaders.map(header => {
      const value = row[header] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
}

app.post('/compare', upload.fields([
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || !req.files.file1 || !req.files.file2) {
      return res.status(400).json({ error: 'Please upload both CSV files' });
    }

    const file1 = req.files.file1[0];
    const file2 = req.files.file2[0];

    const file1Content = file1.buffer.toString('utf-8');
    const file2Content = file2.buffer.toString('utf-8');

    const comparisonCSV = compareCSVFiles(file1Content, file2Content, file1.originalname, file2.originalname);
    const outputFilename = generateOutputFilename(file1.originalname, file2.originalname);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.send(comparisonCSV);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
