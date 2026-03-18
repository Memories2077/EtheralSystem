import { exec } from "child_process";
import fs from "fs";

export function validateYAML(specPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Validating YAML file: ${specPath}`);

    // Kiểm tra file tồn tại trước
    if (!fs.existsSync(specPath)) {
      reject(new Error(`File not found: ${specPath}`));
      return;
    }

    // Kiểm tra file có content không
    const stats = fs.statSync(specPath);
    if (stats.size === 0) {
      reject(new Error(`File is empty: ${specPath}`));
      return;
    }

    console.log(`📊 File size: ${stats.size} bytes`);

    exec(
      `npx swagger-cli validate "${specPath}"`,
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ swagger-cli validation failed:`, error.message);
          if (stderr) console.error(`❌ stderr:`, stderr);
          reject(new Error(stderr || error.message));
          return;
        }

        console.log(`✅ swagger-cli validation successful!`);
        resolve("valid");
      }
    );
  });
}

export async function confirm(
  specPath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔎 Starting validation for: ${specPath}`);
    await validateYAML(specPath);
    console.log(`✅ Validation completed successfully!`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Validation failed:`, error);
    return { success: false, error: error.message || String(error) };
  }
}
