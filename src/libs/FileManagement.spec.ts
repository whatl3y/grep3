import assert from "assert";
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
});
