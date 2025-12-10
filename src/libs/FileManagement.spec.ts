import assert from "assert";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import FileManagement from "./FileManagement";

const fileMgmt = FileManagement();

describe("FileManagement", function () {
  describe("#createNewFileName", function () {
    it(`should append appropriate text to new filename from original`, function () {
      const newFilename1 = fileMgmt.createNewFileName("abc.txt", "additional");
      const newFilename2 = fileMgmt.createNewFileName("abc.txt");
      const newFilename3 = fileMgmt.createNewFileName(
        "a/name/with/slashes.txt"
      );
      assert.strictEqual(newFilename1, "abc_additional.txt");
      assert.strictEqual(true, /^abc_\d+\.txt$/.test(newFilename2));
      assert.strictEqual(
        true,
        /^a%2Fname%2Fwith%2Fslashes_\d+\.txt$/.test(newFilename3)
      );
    });
  });

  describe("#doesDirOrFileExist", function () {
    let testDir: string;

    beforeEach(async function () {
      // Create a temporary directory for testing
      testDir = await mkdtemp(join(tmpdir(), "file-mgmt-test-"));
    });

    afterEach(async function () {
      // Clean up the temporary directory
      if (testDir) {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    it("should return true when a file exists", async function () {
      const testFile = join(testDir, "test-file.txt");
      await writeFile(testFile, "test content");

      const result = await fileMgmt.doesDirOrFileExist(testFile);
      assert.strictEqual(result, true);
    });

    it("should return true when a directory exists", async function () {
      const result = await fileMgmt.doesDirOrFileExist(testDir);
      assert.strictEqual(result, true);
    });

    it("should return false when a file does not exist", async function () {
      const nonExistentFile = join(testDir, "non-existent-file.txt");

      const result = await fileMgmt.doesDirOrFileExist(nonExistentFile);
      assert.strictEqual(result, false);
    });

    it("should return false when a directory does not exist", async function () {
      const nonExistentDir = join(testDir, "non-existent-directory");

      const result = await fileMgmt.doesDirOrFileExist(nonExistentDir);
      assert.strictEqual(result, false);
    });

    it("should return false for nested non-existent paths", async function () {
      const nestedPath = join(testDir, "a", "b", "c", "file.txt");

      const result = await fileMgmt.doesDirOrFileExist(nestedPath);
      assert.strictEqual(result, false);
    });
  });
});
