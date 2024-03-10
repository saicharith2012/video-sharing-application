import { Router } from "express";
import {
  logoutUser,
  loginUser,
  registerUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUserData,
  updateUserDetails,
  updateUserAvatar,
  updateUserCoverImage,
} from "../controllers/user.controllers.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

// secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/change-password").put(verifyJWT, changeCurrentPassword);
router.route("/user-data").get(verifyJWT, getCurrentUserData);
router.route("/update-user").put(verifyJWT, updateUserDetails);
router
  .route("/update-avatar")
  .put(verifyJWT, upload.single("avatar"), updateUserAvatar);
router
  .route("/update-cover")
  .put(verifyJWT, upload.single("coverImage"), updateUserCoverImage);
export default router;
