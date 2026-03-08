import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Options for the find and replace operation
 */
interface ReplaceOptions {
  directory: string;           // Target directory path
  findText: string;           // Text to find
  replaceText: string;        // Text to replace with
  filePattern?: RegExp;       // Optional regex pattern to match files (e.g., /\.ts$/)
  recursive?: boolean;        // Whether to search subdirectories
  encoding?: BufferEncoding;  // File encoding
}

/**
 * Performs a find and replace operation across files in a directory
 * @param options Configuration options for the replace operation
 * @returns Promise with counts of files processed and replacements made
 */
async function findAndReplaceInDirectory({
  directory,
  findText,
  replaceText,
  filePattern = /.*/,
  recursive = true,
  encoding = 'utf8'
}: ReplaceOptions): Promise<{ filesProcessed: number; replacementsMade: number }> {
  let filesProcessed = 0;
  let replacementsMade = 0;

  try {
    // Verify directory exists
    await fs.access(directory);

    // Read directory contents
    const entries = await fs.readdir(directory, { withFileTypes: true });

    // Process each entry
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory() && recursive) {
        // Recursively process subdirectories
        const subResult = await findAndReplaceInDirectory({
          directory: fullPath,
          findText,
          replaceText,
          filePattern,
          recursive,
          encoding
        });
        filesProcessed += subResult.filesProcessed;
        replacementsMade += subResult.replacementsMade;
      } else if (entry.isFile() && filePattern.test(entry.name)) {
        try {
          // Read file content
          const content = await fs.readFile(fullPath, encoding);

          // Count occurrences and perform replacement
          const occurrences = (content.match(new RegExp(findText, 'g')) || []).length;

          if (occurrences > 0) {
            const newContent = content.replace(new RegExp(findText, 'g'), replaceText);

            // Write modified content back to file
            await fs.writeFile(fullPath, newContent, encoding);

            filesProcessed++;
            replacementsMade += occurrences;
            console.log(`Processed: ${fullPath} (${occurrences} replacements)`);
          }
        } catch (fileError) {
          console.error(`Error processing file ${fullPath}:`, fileError);
        }
      }
    }

    return { filesProcessed, replacementsMade };
  } catch (error) {
    console.error(`Error accessing directory ${directory}:`, error);
    throw error;
  }
}

export async function executeFindAndReplace(_: {
  directory: string,
  find: string,
  replace: string,
}) {
  const {
    directory,
    find,
    replace,
  } = _;

  try {
    const result = await findAndReplaceInDirectory({
      directory,
      findText: find,
      replaceText: replace,
      filePattern: /\.(ts|js|json)$/,
      recursive: true,
      encoding: 'utf8'
    });

    console.log(`Operation completed:`);
    console.log(`Files processed: ${result.filesProcessed}`);
    console.log(`Replacements made: ${result.replacementsMade}`);
  } catch (error) {
    console.error('Find and replace operation failed:', error);
  }
}

// const [_, __, find, replace, directory] = process.argv;

// executeFindAndReplace({ find, replace, directory });