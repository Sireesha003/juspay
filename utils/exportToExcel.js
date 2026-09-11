// utils/exportToExcel.js
import ExcelJS from "exceljs";

export const exportToExcel = async (columns, data = [], fileName = "template.xlsx") => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  // Define headers (static)
  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 20,
  }));

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9E1F2" }, // Light blue
    };
  });

   // Add data rows if provided
  if (data.length > 0) {
    data.forEach((row) => worksheet.addRow(row));
  }

  // Create Excel file buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

