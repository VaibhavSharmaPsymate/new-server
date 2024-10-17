const { User } = require("../../schemas/User");
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { SiteSettings } = require("../../schemas/SiteSettings");
const { createQuery } = require("../../utils/Helper");
const config = process.env;
const Joi = require("joi");

router.post("/getUser", (req, res, next) => {
  const userCredential = req.body.credential;
  const userType = req.query.type || req.body.type;
  const search = req.query.search;
  const keyword = req.query.keyword;
  if (!userType) {
    res.status(400).json({ status: 400, message: "Invalid User Credentials" });
  } else {
    if (userCredential) {
      User.findOne({
        $or: [
          { phone: userCredential },
          { email: userCredential },
          { _id: userCredential },
          { phoneNumber: userCredential },
        ],
        type: userType,
      })
        .then((success) => {
          if (success === null) {
            res
              .status(200)
              .json({ status: 200, message: "User does not exist" });
          } else {
            res.status(200).json({
              status: 200,
              message: `Successfull`,
              data: { ...success._doc },
            });
          }
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    } else if (search) {
      User.find({ displayName: { $regex: search, $options: "i" } })
        .then((response) => {
          res.json({ status: 200, data: response, message: `Success` });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    } else if (keyword) {
      User.find({ displayName: keyword })
        .then((response) => {
          res.json({ status: 200, data: response, message: `Success` });
        })
        .catch((error) => {
          console.log(error);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    } else {
      User.find()
        .then((success) => {
          if (success === null) {
            res
              .status(200)
              .json({ status: 200, message: "User does not exist" });
          } else {
            res.status(200).json({
              status: 200,
              message: `Success`,
              data: success,
            });
          }
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    }
  }
});

router.post("/role", (req, res, next) => {
  const userCredential = req.body.credential || req.query.credential;
  const roleToAdd = req.query.role || req.body.role;
  const token = jwt.sign({ userId: req.query.credential }, config.JWT_SECRET, {
    expiresIn: "2d",
  });

  if (!userCredential) {
    res.status(400).json({ status: 400, message: "Invalid User Credentials" });
  } else {
    // Find the user by their credentials
    User.findOneAndUpdate(
      {
        $or: [{ phone: userCredential }, { email: userCredential }],
        // Check if the "academic" role doesn't already exist in the roles array
        roles: { $ne: roleToAdd },
      },
      {
        $addToSet: { roles: roleToAdd }, // Add the role if it doesn't exist
      },
      { new: true }
    )
      .then((result) => {
        if (result === null) {
          res.status(400).json({
            status: 400,
            message: "User does not exist or role already exists",
          });
        } else {
          res.status(200).json({
            status: 200,
            message: "Successfully updated user data",
            data: { ...result._doc, jwt: token },
            jwt: token,
          });
        }
      })
      .catch((err) => {
        console.log(err);
        res.status(400).json({
          status: 400,
          message: "Invalid user or role",
        });
      });
  }
});

router.put("/user/:id", async (req, res) => {
  const userId = req.params.id;
  const userData = req.body;

  const requestData = Joi.object({
    userId: Joi.string().required(),
    userData: Joi.object().required(),
  });
  
  const { error } = requestData.validate({
    userId,
    userData,
  });

  if (error) {
    return res.status(400).json({ status: 400, message: error.message });
  }

  if (!userId || !userData) {
    return res.status(400).json({ status: 400, message: "Invalid details" });
  } else {
    try {
      if (userData.socialUserName) {
        const validSocialUserName = /^[a-z0-9._]+$/;

        // Check if the socialUserName matches the regular expression
        if (!validSocialUserName.test(userData.socialUserName)) {
          return res.status(400).json({
            message: "socialUserName must contain only lowercase letters, underscores, or periods.",
          });
        }

        // Check if socialUserName exists and is unique
        const existingUser = await User.findOne({
          socialUserName: userData.socialUserName,
          _id: { $ne: new ObjectId(userId) }, 
        });

        if (existingUser) {
          return res.status(400).json({
            message: "socialUserName already exists",
            _id: { $ne: new ObjectId(userId) },
          });
        }
      }

      // Process photoURL if it's an array
      if (userData.photoURL && Array.isArray(userData.photoURL)) {
        userData.photoURL = userData.photoURL
          .map((photo) => photo.path)
          .join(", "); // Adjust this based on how you want to store the array
      }

      const updateDoc = {
        $set: { ...userData, updatedAt: new Date() },
      };

      const result = await User.updateOne(
        { _id: new ObjectId(userId) },
        updateDoc
      );

      if (result) {
        const updatedResults = await User.find({ _id: new ObjectId(userId) });
        res.status(200).json({
          status: 200,
          message: "User details have been updated successfully",
          data: updatedResults,
        });
      }
    } catch (error) {
      console.log("error", error);
      res.status(500).json({
        status: 500,
        message: "Error while updating the user details",
      });
    }
  }
});


router.get("/getAllUsers", (req, res) => {
  const userType = req.query.type;
  const doctorsId = req.query.id;
  const filterBy = req.query.specialization;

  if (!userType) {
    res.status(400).json({ status: 400, message: "Invalid User Credentials" });
  } else {
    if (userType === "doctor" && !doctorsId && !filterBy) {
      User.find({ type: userType })
        .then((success) => {
          const updatedResponse = success.map((item) => {
            return {
              defaultPrice: item.price * 15,
              ...item._doc,
            };
          });
          res.status(200).json({
            status: 200,
            count: updatedResponse.length,
            message: `Success`,
            data: [
              ...updatedResponse.sort((a, b) =>
                a.rank > b.rank ? 1 : b.rank > a.rank ? -1 : 0
              ),
            ],
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    } else if (userType === "doctor" && filterBy) {
      User.find({ type: userType, specialization: [filterBy] })
        .then((success) => {
          const updatedResponse = success.map((item) => {
            return {
              defaultPrice: item.price * 15,
              ...item._doc,
            };
          });
          res.status(200).json({
            status: 200,
            count: updatedResponse.length,
            message: `Success`,
            data: [
              ...updatedResponse.sort((a, b) =>
                a.rank > b.rank ? 1 : b.rank > a.rank ? -1 : 0
              ),
            ],
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    } else if (userType === "doctor" && doctorsId) {
      User.find({ _id: doctorsId })
        .then((success) => {
          const updatedResponse = success.map((item) => {
            return {
              defaultPrice: item.price * 15,
              ...item._doc,
            };
          });
          res.status(200).json({
            status: 200,
            message: `Success`,
            count: updatedResponse.length,
            data: [
              ...updatedResponse.sort((a, b) =>
                a.rank > b.rank ? 1 : b.rank > a.rank ? -1 : 0
              ),
            ],
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Doctor's profile doesn't exist",
          });
        });
    } else {
      User.find({ type: userType })
        .then((success) => {
          res.status(200).json({
            status: 200,
            message: `Success`,
            data: [...success],
          });
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({
            status: 500,
            message: "Server error in processing your request",
          });
        });
    }
  }
});

router.get("/users", async (req, res) => {
  const { search, searchBy, exact, id, page, limit, boolean } = req.query;
  const query = createQuery(search, searchBy, exact, boolean);

  const pageNumber = parseInt(page) || 1;
  const itemsPerPage = parseInt(limit) || 10;
  const skipItems = (pageNumber - 1) * itemsPerPage;

  try {
    const totalPatients = await User.countDocuments({
      deleted: false,
      ...query,
    });
    const totalPages = Math.ceil(totalPatients / itemsPerPage);

    const patients = await User.find({ ...query })
      .sort({ createdAt: -1 })
      .skip(skipItems)
      .limit(itemsPerPage);

    if (id && patients.length === 0) {
      return res
        .status(200)
        .json({ status: 200, message: "Patient does not exist" });
    } else {
      return res.status(200).json({
        status: 200,
        message: "Success",
        data: patients,
        total: totalPatients,
        totalPages: totalPages,
        currentPage: pageNumber,
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Server error in processing your request",
    });
  }
});

router.post("/user", async (req, res) => {
  const userType = req.query.type;
  const userData = req.body.data;
  const count = await User.countDocuments();
  const psyId = `2021${String(count + 1).padStart(6, "0")}`;

  if (!userType || !userData) {
    res.status(400).json({ status: 400, message: "Invalid User Credentials" });
  } else {
    const newUid = uuidv4();
    const user = new User({
      ...userData,
      uid: newUid,
      type: userType,
      psyId: psyId,
    });
    user
      .save()
      .then((result) => {
        res.json({
          status: "200",
          message: "Success",
          data: { uid: newUid },
        });
      })
      .catch((err) => {
        console.log(err);
        res.status(500).json({ message: "Error. Please try again" });
      });
  }
});

router.delete("/user/delete", async (req, res) => {
  const userId = req.query.id;
  if (!userId) {
    res.json({ status: 400, message: "Incomplete User Credentials" });
  }
  try {
    const result = await User.deleteOne({ _id: new ObjectId(userId) });
    if (result) {
      res.status(200).json({
        status: 200,
        message: `Successfully deleted user`,
        data: result,
      });
    }
  } catch (err) {
    res.status(500).json({
      status: 500,
      message: "Server error in processing your request",
    });
  }
});

module.exports = router;
