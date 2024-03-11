import cloudinary from "cloudinary";
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
    // upload to cloudinary
    const response = await cloudinary.v2.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // remove the file after it got successfully uploaded.
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); //remove the locally saved temporary file path as the upload operation got failed.
    return null;
  }
};

// deleting file on the cloudinary
const deleteOnCloudinary = async (publicId) => {
  try {
    if (!publicId) return null;

    // delete from cloudinary
    const response = await cloudinary.v2.uploader.destroy(publicId, {
      resource_type: "image",
    });

    return response;
  } catch (error) {
    return null;
  }
};

export { uploadOnCloudinary, deleteOnCloudinary };
