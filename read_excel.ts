import * as xlsx from 'xlsx';
import * as fs from 'fs';

try {
  const filePath = '青青草原廚房_整理版ETHAEHTEHE菜單(1).xlsx';
  const fileData = fs.readFileSync(filePath);
  const workbook = xlsx.read(fileData);
  const result: Record<string, any[]> = {};

  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    result[sheetName] = xlsx.utils.sheet_to_json(worksheet);
  });

  fs.writeFileSync('excel_dump.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log('Success');
} catch (error) {
  fs.writeFileSync('error_dump.log', String(error), 'utf-8');
  console.error(error);
}
