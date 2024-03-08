import { v2 } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// first upload the temporarily saved file on the server to Cloudinary
const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.v2.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    console.log("File uploaded on cloudinary successfully!", response);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); //remove the locally saved temporary file path as the upload operation got failed.
    return null;
  }
};

// remove the file after it got successfully uploaded.


export {uploadOnCloudinary}