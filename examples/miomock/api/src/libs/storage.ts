import { Disk } from "flydrive";
import { FSDriver } from "flydrive/drivers/fs";
import { SignedURLOptions } from "flydrive/types";
import path from "path";

const STORAGE_DRIVE = process.env.NODE_ENV === "production" ? "s3" : "local";

export const fileDisk = new Disk(
  (() => {
    if (STORAGE_DRIVE === "s3") {
      // s3 driver
    }
    return new FSDriver({
      location: path.join(__dirname, "../../", "public", "uploaded"),
      visibility: "public",
      urlBuilder: {
        generateURL(key: string, _filePath: string): Promise<string> {
          return Promise.resolve(`/api/public/uploaded/${key}`);
        },

        generateSignedURL(
          key: string,
          _filePath: string,
          _options: SignedURLOptions
        ): Promise<string> {
          return Promise.resolve(`/api/public/uploaded/${key}`);
        },
      },
    });
  })()
);
