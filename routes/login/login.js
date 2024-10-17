const express = require("express");
const router = express.Router();
const { User } = require("../../schemas/User");
const { Project } = require("../../schemas/Project");
const otpGenerator = require("otp-generator");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = process.env;
const jwt = require("jsonwebtoken");
const { SiteSettings } = require("../../schemas/SiteSettings");
const qr = require("qrcode");
const fs = require("fs"); // Import the built-in 'fs' library to read the PDF file
const { uploadToS3Bucket } = require("../../utils/s3Service");
// const { Transaction } = require("../../schemas/Transactions");
const {
  sendPatientEmail,
  sendWhatsAppMessage,
  decryptData,
  encryptData,
  parsePhoneNumber,
  parseDisplayName,
  sendOtp,
  validateToken,
} = require("../../utils/Helper");
const Joi = require("joi");
const { userInfo } = require("os");

const ABHA_BASE_URL = "https://healthidsbx.abdm.gov.in/api/";


const testingNumbers = [
  "1111111111",
  "2222222222",
  "3333333333",
  "4444444444",
  "5555555555",
  "6666666666",
  "7777777777",
  "8888888888",
  "9999999999",
];

router.get("/:credential", async (req, res) => {
  try {
    const { credential } = req.params;

    const validation = Joi.object({
      credential: Joi.string()
        .length(10)
        .pattern(/^[0-9]+$/)
        .required(),
    });

    const { error } = validation.validate({
      credential,
    });

    if (error) {
      console.log(error.message, "/:credential/");
      return res.status(400).json({ status: 401, message: error.message });
    }
    const phone = parsePhoneNumber(credential).phone;
    console.log("phone-", phone);
    if (!phone) {
      return res
        .status(401)
        .json({ status: 401, message: "Invalid User phones" });
    }

    let otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    console.log("otp-", otp);

    if (testingNumbers.indexOf(phone) !== -1) {
      otp = "000000";
      console.log("OTP not sent to testing Numbers");
    } else {
      await sendOtp(phone, otp);
    }

    const encryptedOtp = encryptData(otp);

    const result = await User.findOneAndUpdate(
      { $or: [{ phone: phone }] },
      { $set: { otp: encryptedOtp } }
    );
    try {
      if (result === null || result.type === "lead") {
        const oldLead = await User.findOneAndUpdate(
          { phone },
          { $set: { otp: encryptedOtp } }
        );
        if (oldLead === null) {
          const lead = new User({
            countryCode: parsePhoneNumber(credential).countryCode,
            phone: parsePhoneNumber(credential).phone,
            otp: encryptedOtp,
            platform: {
              ...req.headers,
            },
            uid: uuidv4(),
            type: "lead",
            created: false,
          });

          await lead.save();
          console.log(`Lead created for ${parsePhoneNumber(credential).phone}`);
        } else {
          console.log(
            `Lead updated for ${parsePhoneNumber(oldLead.phone).phone}`
          );
        }

        return res.status(200).json({
          status: 200,
          login: false,
          message: `User with ${parsePhoneNumber(credential).countryCode} ${
            parsePhoneNumber(credential).phone
          } is not registered`,
        });
      }
    } catch (error) {
      console.error("Error saving lead:", error);
      return res.status(500).json({
        status: 500,
        login: false,
        message: "Internal Server Error",
      });
    }

    return res.status(200).json({
      status: 200,
      login: true,

      message: `OTP sent to ${parsePhoneNumber(credential).countryCode} ${
        parsePhoneNumber(credential).phone
      } on SMS`,

      message: `OTP sent to ${parsePhoneNumber(credential).countryCode} ${
        parsePhoneNumber(credential).phone
      } on SMS`,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Server error in processing your request",
    });
  }
});

router.get("/user/validate", validateToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.userId });
    if (!user) {
      return res.status(401).json({
        status: 401,
        message: "User not found",
      });
    }
    return res.status(200).json({
      status: 200,
      user: user,
      message: "Success",
    });
  } catch (err) {
    return res.status(500).json({
      status: 500,
      message: "Server Error",
    });
  }
});

router.get("/user/token/validate", async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: Missing token" });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized: Invalid token" });
      }

      const user = await User.findOne({ uid: decoded.userId });
      if (!user) {
        return res.status(401).json({
          status: 401,
          message: "User not found",
        });
      }
      return res.status(200).json({
        status: 200,
        user: user,
        message: "Success",
      });
    });
  } catch (err) {
    return res.status(500).json({
      status: 500,
      message: "Server Error",
      err: err.message || err, 
    });
  }
});

router.get("/verify/:credential/:otp", async (req, res) => {
  try {
    const { credential, otp } = req.params;

    const validation = Joi.object({
      credential: Joi.number().required(),
      otp: Joi.number().required(),
    });

    const { error } = validation.validate({
      credential,
      otp,
    });

    if (error) {
      console.log(error.message, "verify/:credential/:otp");
      return res.status(400).json({ error: error.message });
    }

    const phone = parsePhoneNumber(credential).phone;

    const user = await User.findOne({
      $or: [{ phone: phone }, { phoneNumber: phone }],
    });

    if (!user) {
      console.log(
        `User with ${parsePhoneNumber(credential).countryCode} ${
          parsePhoneNumber(credential).phone
        } is not registered`
      );
      return res.status(401).json({
        status: 401,
        login: false,
        message: `User with ${parsePhoneNumber(credential).countryCode} ${
          parsePhoneNumber(credential).phone
        } is not registered`,
      });
    }

    const storedEncryptedOtp = user.otp;
    const decryptedOtp = decryptData(storedEncryptedOtp);

    const isOtpValid = otp === decryptedOtp;

    if (isOtpValid) {
      await User.findOneAndUpdate(
        { $or: [{ phone: phone }, { phoneNumber: phone }] },
        { $set: { encryptedOtp: null } }
      );

      const token = jwt.sign({ userId: user._doc.uid }, config.JWT_SECRET, {
        expiresIn: "2d",
      });
      console.log(
        `OTP verification for ${parsePhoneNumber(credential).countryCode} ${
          parsePhoneNumber(credential).phone
        } is successfull`
      );
      return res.status(200).json({
        status: 200,
        login: true,
        register: user.type === "lead" ? false : true,
        message: `OTP verification for ${
          parsePhoneNumber(credential).countryCode
        } ${parsePhoneNumber(credential).phone} is successfull`,
        userData: { ...user._doc, jwt: token },
      });
    } else {
      console.log(`${decryptedOtp} is not same as ${otp}`);
      return res
        .status(401)
        .json({ status: 401, login: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error in processing your request",
    });
  }
});
router.post("/register", validateToken, async (req, res) => {
  const userData = req.body.data;
  const type = req.query.type;
  const uid = uuidv4();
  const token = jwt.sign({ userId: uid }, config.JWT_SECRET, {
    expiresIn: "2d",
  });

  const phone = userData?.phone;
  const userId = userData?.userId;
  const email = userData?.email;
  const displayName = userData?.displayName;
  const socialUserName = userData?.socialUserName;

  const validation = Joi.object({
    phone: Joi.number().required(),
    displayName: Joi.string().required(),
    socialUserName: Joi.string()
      .pattern(/^[a-z0-9_.]+$/) // Only lowercase letters, numbers, underscores, dots
      .messages({
        "string.pattern.base":
          "Social username can only contain lowercase letters, numbers, underscores, and dots.",
      })
      .when(Joi.ref("$socialUserNameExists"), {
        is: true,
        then: Joi.required(),
      }), // Make mandatory if exists
  });

  const { error } = validation.validate(
    {
      phone,
      displayName,
      socialUserName,
    },
    {
      context: { socialUserNameExists: !!socialUserName }, // Pass context to make socialUserName mandatory if it exists
    }
  );

  if (error) {
    console.log(error.message, "/register");
    return res.status(400).json({ error: error.message });
  }

  try {
    console.log("Trying the User Registration");
    if (phone) {
      // Check if the provided Phone is unique
      const existingUserWithPhone = await User.findOne({
        phone: parsePhoneNumber(phone).phone,
        created: true,
      });
      if (existingUserWithPhone) {
        console.log(
          `${parsePhoneNumber(phone).countryCode} ${
            parsePhoneNumber(phone).phone
          } is already registered`
        );

        return res.status(200).json({
          status: 200,
          message: `User with ${parsePhoneNumber(phone)?.countryCode} ${
            parsePhoneNumber(phone)?.phone
          } is already registered`,
          login: true,
          data: { user: existingUserWithPhone, jwt: token },
          jwt: token,
        });
      }
    }

    if (email) {
      // Check if the provided userId is unique
      const existingUserWithEmail = await User.findOne({
        email: email,
      });
      if (existingUserWithEmail) {
        console.log(
          `${parsePhoneNumber(phone).countryCode} ${
            parsePhoneNumber(phone).phone
          } is already registered with the given email ${email}`
        );
        return res.status(400).json({
          status: 400,
          message: "Email is already taken.",
        });
      }
    }

    if (userId) {
      // Check if the provided userId is unique
      const existingUserWithuserId = await User.findOne({
        userId: userId,
      });
      if (existingUserWithuserId) {
        console.log(
          `${parsePhoneNumber(phone).countryCode} ${
            parsePhoneNumber(phone).phone
          } is already registered with the given user ID ${userId}`
        );
        return res.status(400).json({
          status: 400,
          message: "User ID is already taken.",
        });
      }
    }

    let existingSettings = await SiteSettings.findOne();
    console.log("existing set-", existingSettings);
    if (!existingSettings) {
      existingSettings = new SiteSettings();
    }
    existingSettings.psyID += 1;
    const psyID = existingSettings.psyID;
    console.log(`Generated the PSY ID - ${psyID}`);

    userData.dateOfBirth = (userData?.dateOfBirth || "").toString();
    const newUser = new User({
      ...userData,
      type: type || "patient",
      uid: uid,
      status: "unverified",
      balance: 0,
      firstName: parseDisplayName(displayName)?.firstName,
      lastName: parseDisplayName(displayName)?.lastName,
      displayName: parseDisplayName(displayName)?.displayName,
      phone: parsePhoneNumber(phone).phone,
      countryCode: parsePhoneNumber(phone).countryCode,
      psyID: psyID,
      createdBy: {
        _id: "660bccd53a9d3b514c36d445",
        email: "yash@psymate.org",
        psyID: 2020000001,
        phone: "8770183178",
        photoURL:
          "https://psymate-file-uploads.s3.ap-south-1.amazonaws.com/undefined/T0AUF6PE0-U0495T8GVPT-a3761bb5f87f-512.jpg",
      },
    });
    if (userData?.referral) {
      const referralUser = await User.findOne({
        psyID: Number(userData?.referral),
      });
      console.log("referralUser", userData?.referral, referralUser);
      if (referralUser) {
        console.log(
          `${parsePhoneNumber(phone).countryCode} ${
            parsePhoneNumber(phone).phone
          } Referral Code Valid ${userId}`
        );
        newUser.balance += 2000;
      }
    }

    const doctorId = newUser._id.toString();

    const pageURL = `https://www.psymate.org/expert/${doctorId}?service=checkIn`;

    // if (type === "doctor") {
    //   console.log(
    //     `Generating the QR code for ${parsePhoneNumber(phone).phone} - ${psyID}`
    //   );

    //   const qrCodeData = await qr.toDataURL(pageURL);

    //   // Convert the QR code data URL to a Buffer
    //   const qrCodeBuffer = Buffer.from(
    //     qrCodeData.replace(/^data:image\/png;base64,/, ""),
    //     "base64"
    //   );

    //   // Create a unique file name
    //   const imagePath = `qr_${uuidv4()}.png`;

    //   // Save the QR code image to a file
    //   await fs.promises.writeFile(imagePath, qrCodeBuffer);

    //   // Upload the image to Amazon S3
    //   const uploadToS3 = await uploadToS3Bucket([
    //     {
    //       originalname: imagePath,
    //       buffer: qrCodeBuffer,
    //       filename: "profile",
    //     },
    //   ]);
    //   newUser.qr = uploadToS3[0].Location;
    //   console.log(
    //     `Generated and saved the QR code for ${parsePhoneNumber(phone).phone
    //     } - ${psyID} to location - ${uploadToS3[0].Location
    //     }, and sent the whatsApp message`
    //   );

    //   // Send a WhatsApp message with the PDF attachment
    //   await sendWhatsAppMessage(Number(newUser.phone), {
    //     template_name: "registeration_doctor",
    //     broadcast_name: "registeration_doctor",
    //     parameters: [
    //       {
    //         name: "doctor_name",
    //         value: newUser.displayName,
    //       },
    //       {
    //         name: "doctor_qr_url",
    //         value: uploadToS3[0].Location,
    //       },
    //     ],
    //   });
    // }
    // if (type === "doctor" || type === "teams") {
    //   const newTransaction = new Transaction({
    //     creditedUser: newUser,
    //     totalAmount: 5000,
    //     paymentMethod: "wallet",
    //     transactionDate: new Date(),
    //     status: "completed",
    //     billingAddress: {
    //       street: "N/A",
    //       city: "N/A",
    //       state: "N/A",
    //       postalCode: "N/A",
    //       country: "N/A",
    //     },
    //     currency: "INR",
    //   });
    //   const savedTransaction = await newTransaction.save();
    //   await newTransaction.save();

    //   const plan = await Plan.findOne({ displayName: "Pro" });
    //   const userPlan = {
    //     displayName: plan?.displayName,
    //     validity: plan?.validity,
    //     currency: plan?.currency,
    //     price: plan?.price,
    //   };
    //   newUser.balance += 5000;
    //   newUser.plan.push(userPlan);
    //   console.log("Adding 5000 to the wallet of the doctor !");
    // }

    console.log("parsephone-", parsePhoneNumber(phone));
    await User.deleteMany({
      phone: parsePhoneNumber(phone)?.phone,
      created: false,
    });

    await existingSettings.save();
    await newUser.save();
    try {
      const project = new Project({
        user: {
          _id: newUser._id.toString(),
          displayName: newUser?.displayName,
          phone: newUser?.phone,
          email: newUser?.email,
          psyID: newUser?.psyID,
        },
        displayName: `${newUser.firstName}'s Care Plan`,
        description: `Welcome, ${newUser.firstName}! Discover the Care Plan designed to make your experience seamless and enjoyable.`,
      });
      await project.save();
    } catch (error) {
      console.log(
        `Error While Creating ${newUser.firstName}'s Care Plan- `,
        error
      );
    }

    console.log(
      `User creation for ${parsePhoneNumber(phone)?.countryCode} ${
        parsePhoneNumber(phone)?.phone
      } is successfull`
    );
    res.status(200).json({
      status: 200,
      message: `User creation for ${parsePhoneNumber(phone)?.countryCode} ${
        parsePhoneNumber(phone)?.phone
      } is successfull`,
      login: true,
      data: { user: newUser, jwt: token },
      jwt: token,
    });
  } catch (error) {
    console.log(error);
    console.log(
      `User creation for ${parsePhoneNumber(phone)?.countryCode} ${
        parsePhoneNumber(phone)?.phone
      } is unsuccessfull`
    );
    res.status(500).json({
      status: 500,
      message: "Server error in processing your request",
    });
  }
});
router.get("/resend/otp/:credential", async (req, res) => {
  const phone = parseInt(req.params.credential);
  if (phone) {
    let otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    const encryptedOtp = encryptData(otp);

    const result = await User.findOneAndUpdate(
      { $or: [{ phone: phone }, { phoneNumber: phone }] },
      { $set: { otp: encryptedOtp } }
    );

    if (testingNumbers.indexOf(phone) !== -1) {
      otp = "000000";
      res.status(200).json({
        status: 200,
        message: `OTP not sent to testing Numbers`,
      });
    } else {
      await sendOtp(phone, otp);
      res.status(200).json({
        status: 200,
        message: `OTP Sent Again on ${phone}`,
      });
    }
  } else {
    res.status(401).json({ status: 401, message: "Invalid User Credentials" });
  }
});

router.delete("/:credential", (req, res) => {
  const credential = req.params.credential;

  User.deleteOne({
    phone: credential,
  }).then((result) => {
    res.status(404).json({ status: 401, message: "Deleted" });
  });
});

router.put("/user/UpdatePassword", validateToken, async (req, res) => {
  try {
    const { newPassword, id: userId } = req.body.data;

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.password === newPassword) {
      return res.status(404).json({
        error: "New password cannot be the same as the previous password",
      });
    }
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error While Updating Password" });
  }
});

router.post("/user/addverification", validateToken, async (req, res) => {
  try {
    const { value, typeValue, id: userId } = req.body.data;
    console.log(req.user);
    if (!userId) {
      return res.status(400).json({ error: "UserId not found" });
    }

    await User.findOneAndUpdate(
      { _id: userId },
      { $push: { verification: { credential: value, type: typeValue } } },
      { new: true }
    );
    res.status(200).json({ message: "Verification added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error while Verification" });
  }
});

// Update specific entry in verification array
router.put("/user/updateverification/:id", validateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const { value, indexVal: index } = req.body.data;
    if (!userId) {
      return res.status(400).json({ error: "UserId not found" });
    }

    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (index === -1) {
      return res.status(404).json({ error: "Verification entry not found" });
    }
    const valueType = user.verification[index].type;
    user.verification[index] = { credential: value, type: valueType };

    await user.save();

    res
      .status(200)
      .json({ message: "Verification entry updated successfully", user });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Server error while updating verification entry" });
  }
});

// Delete specific entry from verification array
router.delete(
  "/user/deleteverification/:id",
  validateToken,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { index } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "UserId not found" });
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (index === -1) {
        return res.status(404).json({ error: "Verification entry not found" });
      }

      user.verification.splice(index, 1);
      await user.save();

      res
        .status(200)
        .json({ message: "Verification entry deleted successfully", user });
    } catch (error) {
      res
        .status(500)
        .json({ error: "Server error while deleting verification entry" });
    }
  }
);

router.post("/email", async (req, res) => {
  const userId = req.body.userId;
  const password = req.body.password;

  User.findOne(
    {
      userId: userId,
      password: password,
    },
    "+password"
  )
    .select("-__v")
    .then(async (result) => {
      if (result === null) {
        res.status(404).json({ status: 404, message: "User does not exist" });
      } else {
        if (result._doc) {
          if (password != result._doc.password) {
            return res.status(500).json({
              status: 500,
              message: "incorrect password",
            });
          }
          const token = jwt.sign(
            { userId: result._doc.uid },
            config.JWT_SECRET,
            {
              expiresIn: "2d",
            }
          );
          const deviceData = {
            user: {
              _id: result._id.toString(),
              displayName: result?.displayName,
              phone: result?.phone,
              email: result?.email,
              psyID: result?.psyID,
            },
            host: req.headers.host,
            connection: req.headers.connection,
            contentLength: req.headers["content-length"],
            secChUA: req.headers["sec-ch-ua"],
            accept: req.headers.accept,
            contentType: req.headers["content-type"],
            secChUAMobile: req.headers["sec-ch-ua-mobile"],
            authorization: req.headers.authorization,
            userAgent: req.headers["user-agent"],
            secChUAPlatform: req.headers["sec-ch-ua-platform"],
            origin: req.headers.origin,
            secFetchSite: req.headers["sec-fetch-site"],
            secFetchMode: req.headers["sec-fetch-mode"],
            secFetchDest: req.headers["sec-fetch-dest"],
            referer: req.headers.referer,
            acceptEncoding: req.headers["accept-encoding"],
            acceptLanguage: req.headers["accept-language"],
          };
          newdeviceData.save();

   
          res.status(200).json({
            status: 200,
            data: { ...result._doc, jwt: token },
            jwt: token,
          });
        } else {
          res.status(401).json({
            status: 404,
            message: "User password not assigned/activated yet",
          });
        }
      }
    });
});


module.exports = router;
