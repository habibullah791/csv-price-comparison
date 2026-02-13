const fs = require('fs');
const path = require('path');

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

function determineFileOrder(file1Path, file2Path) {
  const timestamp1 = parseTimestampFromFilename(file1Path);
  const timestamp2 = parseTimestampFromFilename(file2Path);

  if (timestamp1 === null && timestamp2 === null) {
    console.log('Warning: Could not parse timestamps from filenames. Using files in provided order.');
    return { firstFile: file1Path, secondFile: file2Path, firstLabel: 'File 1', secondLabel: 'File 2' };
  }

  if (timestamp1 === null) {
    console.log('Warning: Could not parse timestamp from first file. Using files in provided order.');
    return { firstFile: file1Path, secondFile: file2Path, firstLabel: 'File 1', secondLabel: 'File 2' };
  }

  if (timestamp2 === null) {
    console.log('Warning: Could not parse timestamp from second file. Using files in provided order.');
    return { firstFile: file1Path, secondFile: file2Path, firstLabel: 'File 1', secondLabel: 'File 2' };
  }

  if (timestamp1 <= timestamp2) {
    console.log(`File 1 (older): ${path.basename(file1Path)} - Generated at ${new Date(timestamp1).toLocaleString()}`);
    console.log(`File 2 (newer): ${path.basename(file2Path)} - Generated at ${new Date(timestamp2).toLocaleString()}`);
    return { firstFile: file1Path, secondFile: file2Path, firstLabel: 'File 1 (Older)', secondLabel: 'File 2 (Newer)' };
  } else {
    console.log(`File 1 (older): ${path.basename(file2Path)} - Generated at ${new Date(timestamp2).toLocaleString()}`);
    console.log(`File 2 (newer): ${path.basename(file1Path)} - Generated at ${new Date(timestamp1).toLocaleString()}`);
    return { firstFile: file2Path, secondFile: file1Path, firstLabel: 'File 1 (Older)', secondLabel: 'File 2 (Newer)' };
  }
}

function compareCSVFiles(file1Path, file2Path, outputPath, firstLabel, secondLabel) {
  try {
    const file1Content = fs.readFileSync(file1Path, 'utf-8');
    const file2Content = fs.readFileSync(file2Path, 'utf-8');

    const file1 = parseCSV(file1Content);
    const file2 = parseCSV(file2Content);

    if (file1.headers.length === 0 || file2.headers.length === 0) {
      console.error('Error: One or both CSV files are empty or invalid');
      return;
    }

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

    for (const row1 of file1.rows) {
      const matchingRow2 = file2.rows.find(row2 => matchRows(row1, row2, keyColumns));

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

    for (const row2 of file2.rows) {
      const existsInFile1 = file1.rows.some(row1 => matchRows(row1, row2, keyColumns));

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

    const csvContent = csvRows.join('\n');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`Comparison completed! Output saved to: ${outputPath}`);
    console.log(`Total rows compared: ${comparisonRows.length}`);
  } catch (error) {
    console.error('Error comparing CSV files:', error.message);
    process.exit(1);
  }
}

function extractCustomerNameFromFilename(filename) {
  const basename = path.basename(filename, '.csv');
  const patternUnderscore = /-\d{2}_\d{2}_\d{2}-(.+)-price-testing$/;
  const patternHyphen = /-\d{2}-\d{2}-\d{2}-(.+)-price-testing$/;
  const match = basename.match(patternUnderscore) || basename.match(patternHyphen);
  return match ? match[1] : 'Unknown';
}

function generateOutputFilename(file1Path, file2Path) {
  const customerName = extractCustomerNameFromFilename(file1Path) || extractCustomerNameFromFilename(file2Path) || 'Unknown';
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

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node compareCSV.js <file1.csv> <file2.csv> [output.csv]');
  console.log('Example: node compareCSV.js file1.csv file2.csv');
  console.log('If output.csv is not provided, it will be auto-generated with timestamp.');
  process.exit(1);
}

const file1Path = args[0];
const file2Path = args[1];
const outputPath = args[2] || generateOutputFilename(file1Path, file2Path);

if (!fs.existsSync(file1Path)) {
  console.error(`Error: File not found: ${file1Path}`);
  process.exit(1);
}

if (!fs.existsSync(file2Path)) {
  console.error(`Error: File not found: ${file2Path}`);
  process.exit(1);
}

const { firstFile, secondFile, firstLabel, secondLabel } = determineFileOrder(file1Path, file2Path);
compareCSVFiles(firstFile, secondFile, outputPath, firstLabel, secondLabel);
