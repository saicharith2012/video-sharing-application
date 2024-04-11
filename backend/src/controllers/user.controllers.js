import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import validator from "validator";
import { User } from "../models/user.models.js";
import { deleteOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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
    avatarId: avatar.public_id,
    coverImage: coverImage?.url || "",
    coverImageId: coverImage?.public_id || "",
    username: username.toLowerCase(),
    email,
    password,
  });

  // remove password and refresh token from the response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken -avatarId -coverImageId"
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

  if (!username && !email) {
    throw new ApiError(400, "username or email is required.");
  }

  // check if any field is empty
  if (
    (username && [username, password].some((field) => field.trim() === "")) ||
    (email && [email, password].some((field) => field.trim() === ""))
  ) {
    throw new ApiError(400, "all fields are must");
  }

  // checking email and username format
  if (
    !(email
      ? validator.isEmail(email)
      : false || username
        ? validator.isLowercase(username)
        : false)
  ) {
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
  const loggedInUser = await User.findById(existingUser._id).select(
    "-password -refreshToken -avatarId -coverImageId"
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
    .json(new ApiResponse(200, {}, "user logged out successfully."));
});

// refreshing the expired Access token using the refresh token
const refreshAccessToken = asyncHandler(async (req, res) => {
  // extract the refresh token from the user cookies.
  // decode
  // find the user with id from the decoded token
  // check if the token from the user and the token of the user from database matches,
  // generate new token method
  // send response

  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request.");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "invalid refresh token.");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "refresh token is expired or used.");
    }

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user?._id);

    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "access token refreshed."
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "invalid refresh token.");
  }
});

// changing user password
const changeCurrentPassword = asyncHandler(async (req, res) => {
  // take old and new passwords from the user.
  const { oldPassword, newPassword } = req.body;

  // extract the user data from the database (added to req body by auth middleware)
  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(400, "unauthorized request.");
  }

  // compare the passwords with user model method
  if (!(await user.isPasswordCorrect(oldPassword))) {
    throw new ApiError(401, "password incorrect.");
  }

  // update the password and save to the database
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  // send response
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password updated successfully."));
});

// get current user details
const getCurrentUserData = asyncHandler(async (req, res) => {
  // using the authMiddleware that attaches the current user data to the req.
  // bring the data as response.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        data: req.user,
      },
      "user data fetched successfully."
    )
  );
});

const updateUserDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(401, "fullname and email are required.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user,
      },
      "user updated successfully."
    )
  );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  // identify the user
  // upload the new avatar to the server using multer middleware
  const newAvatarLocalPath = req.file?.path;

  if (!newAvatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing.");
  }

  // upload to the cloudinary
  const newAvatar = await uploadOnCloudinary(newAvatarLocalPath);

  if (!newAvatar) {
    throw new ApiError(
      400,
      "Error while uploading a new avatar to cloudinary."
    );
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: newAvatar.url,
        avatarId: newAvatar.public_id,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken -avatarId -coverImageId");

  if (!user) {
    throw new ApiError(401, "unauthorized request.");
  }

  // Delete the old avatar on cloudinary
  const oldAvatarId = req.user?.avatarId;

  if (!oldAvatarId) {
    throw new ApiError(400, "unauthorized request.");
  }

  const response = await deleteOnCloudinary(oldAvatarId);

  if (!response) {
    throw new ApiError(400, "Error while deleting the current avatar");
  }

  // send response.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        data: user,
      },
      "avatar successfully updated."
    )
  );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const newCoverImagePath = req.file?.path;

  if (!newCoverImagePath) {
    throw new ApiError(400, "cover image file missing.");
  }

  // uploading new cover on cloudinary

  const newCoverImage = await uploadOnCloudinary(newCoverImagePath);

  if (!newCoverImage) {
    throw new ApiError(
      400,
      "Error while uploading the cover image to cloudinary."
    );
  }

  // updating the coverImage

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: newCoverImage.url,
        coverImageId: newCoverImage.public_id,
      },
    },
    { new: true }
  ).select("-password -refreshToken -avatarId -coverImageId");

  if (!user) {
    throw new ApiError(400, "unauthorized request.");
  }

  // Delete the old cover image on cloudinary
  const oldCoverId = req.user?.coverImageId;

  if (!oldCoverId) {
    throw new ApiError(400, "unauthorized request.");
  }

  const response = await deleteOnCloudinary(oldCoverId);

  if (!response) {
    throw new ApiError(400, "Error while deleting the current cover image");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { data: user }, "cover image successfully updated.")
    );
});

// user channel profile
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username.trim()) {
    throw new ApiError(400, "username is missing.");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscriptions",
      },
      $addFields: {
        $subscribersCount: {
          $size: "$subscribers",
        },
        $channelsSubscribedToCount: {
          $size: "$subscriptions",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "Channel does not exist.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched succesfully.")
    );
});

// user watch history
const getUserWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(req.user?._id),
      },
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner"
              }
            }
          }
        ],
      },
    },
  ]);

  return res.status(200).json(
    200,
    user[0]?.watchHistory,
    "Watch History fetched successfully."
  )
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUserData,
  updateUserDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getUserWatchHistory,
};
