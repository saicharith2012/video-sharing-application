import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import validator from "validator";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// method to generate access and refresh tokens.
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false }); //saving refresh token to db without any validation

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens."
    );
  }
};

// register user controller
const registerUser = asyncHandler(async (req, res) => {
  // extract the details from the client side
  const { fullName, email, username, password } = req.body;
  // console.log("email: ", email, " \nfullName: ", fullName);

  // validate them - check if they're empty
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "all fields are must.");
  }

  // checking email and username format
  if (!validator.isEmail(email)) {
    throw new ApiError(400, "email is invalid.");
  }

  if (!validator.isLowercase(username)) {
    throw new ApiError(400, "username should be lowercase.");
  }

  // check if the user already exists
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "email or username already in use.");
  }

  // check for images, if there is avatar of the user
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "avatar is required.");
  }

  // upload the avatar and coverImage to the cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "avatar is required.");
  }

  // create a user object in the database
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    username: username.toLowerCase(),
    email,
    password,
  });

  // remove password and refresh token from the response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // check if the user is created
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user.");
  }

  // send the response
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully!"));
});

// login user controller
const loginUser = asyncHandler(async (req, res) => {
  // take the details from the client side
  const { email, username, password } = req.body;

  if (!username || !email) {
    throw new ApiError(400, "username or email is required.");
  }

  // check if any field is empty
  if (
    ([email, password] || [username, password]).some(
      (field) => field.trim() === ""
    )
  ) {
    throw new ApiError(400, "all fields are must");
  }

  // checking email and username format
  if (!validator.isEmail(email) || !validator.isLowercase(username)) {
    throw new ApiError(400, "email or username is invalid.");
  }

  // check if a user exists with the given username or email
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!existingUser) {
    throw new ApiError(404, "user does not exist.");
  }

  // validate the password
  const isPasswordValid = await existingUser.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(400, "password incorrect.");
  }

  // create access token and refresh token and save the refresh token in the database
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    existingUser._id
  );

  // send the tokens to the user in the form of secure cookies
  const loggedInUser = User.findById(existingUser._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true, // options for cookies to ensure only server can modify them.
  };

  // send response
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "user successfully logged in."
      )
    );
});

// logout user controller
const logoutUser = asyncHandler(async (req, res) => {
  // extract the userdetails added to the request body by verifyJWT middleware
  // delete the refreshToken from the database
  // clear the cookies
  // send the response
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true, //returns after update value.
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out successfully."))
});

export { registerUser, loginUser, logoutUser };
