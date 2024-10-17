const { default: axios } = require("axios");
const sendgrid = require("@sendgrid/mail");
const { ObjectId } = require("mongodb");
const { Cart } = require("../schemas/Cart");
const crypto = require("crypto");
const { User } = require("../schemas/User");
const jwt = require("jsonwebtoken");
const { config } = require("dotenv");
const mongoose = require('mongoose');

function generateRandomId(type, length) {
  let characters;

  if (type === "number") {
    characters = "0123456789";
  } else if (type === "mixed") {
    characters = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789${new Date().getTime()}`;
  } else {
    throw new Error("Invalid type specified");
  }

  let randomId = "";
  for (let i = 0; i < length; i++) {
    randomId += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return randomId;
}

const sendOtp = async (phone, otp) => {
  try {
    // Send SMS using 2Factor API
    await axios
      .get(
        `https://2factor.in/API/V1/${process.env.API_KEY_2FACTOR}/SMS/${phone}/${otp}/OtpSMS1`
      )
      .then((res) => {
        console.log("OTP Sent");
      })
      .catch((rr) => {
        console.log("OTP NOT Sent");
      });

    // Send WhatsApp message
    await sendWhatsAppMessage(phone, {
      template_name: "send_otp",
      broadcast_name: "send_otp",
      parameters: [
        {
          name: "otp",
          value: otp,
        },
      ],
    });

    console.log(
      `OTP sent to ${phone}
      } on SMS and whats app`
    );
  } catch (error) {
    console.error("Error sending messages:", error.message);
    throw error;
  }
};
async function getPaginatedResults(
  collection,
  query,
  options,
  page,
  pageSize,
  projection = []
) {
  const skip = (page - 1) * pageSize;
  const limit = parseInt(pageSize);
  var obj = {};
  projection.map((i) => {
    obj[i] = 1;
  });

  const users = await collection
    .find(query, { projection: obj })
    .sort(options)
    .skip(skip)
    .limit(limit)
    .toArray();

  return users;
}

const newCreateQuery = (search, searchBy, exact, boolean, operation, type) => {
  const query = {};

  if (search && searchBy) {
    const searchTerms = search.split(",");
    const searchFields = searchBy.split(",");

    if (searchTerms.length === searchFields.length) {
      searchTerms.forEach((term, index) => {
        const field = searchFields[index].trim();
        const searchTerm = term.trim();

        switch (true) {
          case field === "index":
            query[field] = searchTerm;
            break;
          case exact === field:
            query[field] =
              field === "_id"
                ? ObjectId.isValid(searchTerm)
                  ? new ObjectId(searchTerm)
                  : ""
                : getTypeValue(searchTerm, getFieldDataType(field, type));
            break;
          case boolean === field:
            query[field] = searchTerm === "true";
            break;
          case operation &&
            operation.split(",").some((i) => i.split(".")[0] === field):
            const [operationField, operationType] = operation
              .split(",")
              .find((i) => i.split(".")[0] === field)
              .split(".");
            const arrayValues = searchTerm
              .split(".")
              .map((i) => getTypeValue(i, getFieldDataType(field, type)));
            query[field] =
              operationType === "$in" || operationType === "$or"
                ? { [operationType]: arrayValues }
                : {
                    [operationType]: getTypeValue(
                      searchTerm,
                      getFieldDataType(field, type)
                    ),
                  };
            break;
          default:
            query[field] = {
              $regex: getTypeValue(searchTerm, getFieldDataType(field, type)),
              $options: "i",
            };
            break;
        }
      });
    }
  }
  return query;
};

const getFieldDataType = (field, type) => {
  if (!type) return "text";

  const fieldType = type.split(",").find((i) => i.split(".")[0] === field);
  return fieldType ? fieldType.split(".")[1] || "text" : "text";
};

const getTypeValue = (searchTerm, type) => {
  switch (type) {
    case "number":
      return parseFloat(searchTerm);
    case "date":
      return new Date(searchTerm);
    default:
      return searchTerm;
  }
};

async function sendWhatsAppMessage(countryCode, whatsappNumber, messageData) {
  try {
    await axios.post(
      `${process.env.INTERAKT_BASE_URL}/message/`,
      {
        countryCode: countryCode ? `+${countryCode}` : "+91",
        phoneNumber: whatsappNumber,
        type: "Template",
        template: {
          name: messageData.template_name,
          languageCode: "en",
          headerValues: messageData.headerValues.map((param) => param.mediaUrl),
          bodyValues: messageData.parameters.map((param) => param.value),
        },
      },
      {
        headers: {
          Authorization: `Basic ${process.env.INTERAKT_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`WhatsApp Message Sent to ${whatsappNumber}: `);
  } catch (error) {
    console.error(
      `WhatsApp Message Sending Error to ${whatsappNumber}: `,
      error
    );
  }
}

// function parsePhoneNumber(phoneNumber) {
//   // Remove any non-numeric characters
//   const cleanedNumber = phoneNumber.replace(/\D/g, "");

//   if (cleanedNumber.length === 12) {
//     // If the number is 12 digits, consider the first two as the country code
//     return {
//       countryCode: cleanedNumber.substring(0, 2),
//       phone: cleanedNumber.substring(2),
//     };
//   } else if (cleanedNumber.length === 10) {
//     // If the number is 10 digits, consider it as the phone number and set default country code to 91
//     return {
//       countryCode: "91",
//       phone: cleanedNumber,
//     };
//   } else {
//     // Handle invalid phone numbers or other cases as needed
//     return null;
//   }
// }
function parsePhoneNumber(phoneNumber) {
  // Ensure phoneNumber is a string
  if (typeof phoneNumber !== "string") {
    // Handle the case where phoneNumber is not a string (e.g., set default value or throw an error)
    phoneNumber = String(phoneNumber);
  }

  // Remove any non-numeric characters
  const cleanedNumber = phoneNumber.replace(/\D/g, "");

  if (cleanedNumber.length === 12) {
    // If the number is 12 digits, consider the first two as the country code
    return {
      countryCode: cleanedNumber.substring(0, 2),
      phone: cleanedNumber.substring(2),
    };
  } else if (cleanedNumber.length === 10) {
    // If the number is 10 digits, consider it as the phone number and set default country code to 91
    return {
      countryCode: "91",
      phone: cleanedNumber,
    };
  } else {
    // Handle invalid phone numbers or other cases as needed
    return {
      countryCode: "",
      phone: "",
    };
  }
}

function parseDisplayName(displayName) {
  // Check if displayName is a string
  if (typeof displayName !== "string") {
    // Handle the case where displayName is not a string
    console.error("Error: displayName is not a valid string");
    return {
      firstName: "",
      lastName: "",
      displayName: displayName,
    };
  }

  const nameParts = displayName.split(" ");
  const firstName = nameParts?.[0] || "";
  const lastName = nameParts?.length > 1 ? nameParts?.slice(1)?.join(" ") : "";

  return {
    firstName: firstName,
    lastName: lastName,
    displayName: displayName,
  };
}
function paginateQuery(query, page = 1, limit = 10, sort) {
  const skip = (page - 1) * limit;
  return query
    .sort(sort ? sort : { createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

const processContent = (reportTemplate, content) => {
  // Replace variables in the report
  const processedReport = reportTemplate.replace(
    /{{\s*([\w.]+)\s*}}/g,
    (match, variableName) => {
      return content[variableName] || match;
    }
  );

  return processedReport;
};

function getAllUniqueTagsLowercased(dataArray, index) {
  const tagsSet = new Set();

  dataArray?.forEach((item) => {
    const tag = item?.tag?.toLowerCase().split(",")[index];
    tagsSet.add(tag && tag);
  });

  return Array.from(tagsSet);
}

const createQuery = (search, searchBy, exact, boolean, operation, operator) => {
  const query = {};

  if (search && searchBy) {
    const searchTerms = search.split(",");
    const searchFields = searchBy.split(",");

    if (searchTerms.length === searchFields.length) {
      searchTerms.forEach((term, index) => {
        const field = searchFields[index].trim();
        const searchTerm = term.trim();

        if (field === "index") {
          query[field] = searchTerm;
        } else {
          switch (true) {
            case exact === "true":
              query[field] =
                field === "_id" ? new ObjectId(searchTerm) : searchTerm;
              break;

            case boolean === "true":
              query[field] = searchTerm === "true";
              break;

            case operation === "true":
              const arrayValues = searchTerm.split(".");
              query[field] = { [`$${operator}`]: arrayValues };
              break;

            default:
              query[field] = { $regex: searchTerm, $options: "i" };
              break;
          }
        }
      });
    }
  }

  return query;
};

const sendPatientEmail = async (email, subject, template) => {
  try {
    if (!email) {
      throw new Error("Email is missing");
    }

    const emailOptions = {
      to: email,
      from: process.env.MAIL_FROM,
      subject: subject,
      html: template,
    };

    await sendgrid.send(emailOptions);
    console.log(`Email sent to patient without PDF attachment to ${email}`);
  } catch (err) {
    console.error(
      `Error in sending email to patient with PDF attachment to ${email}`,
      err
    );
    throw err; // Re-throw the error for handling at the higher level
  }
};

const addToCart = async (userId, items) => {
  let totalAmtPaid = 0;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      status: 404,
      message: "User does not exist",
    });
  }

  const cart = await Cart.findOne({ user: userId });
  let existingItems = cart ? cart.items : [];

  const updatedExistingItems = items
    .filter((newItem) =>
      existingItems.some(
        (item) => item._id.toString() === newItem._id.toString()
      )
    )
    .map((newItem) => {
      const existingItem = existingItems.find(
        (item) => item._id.toString() === newItem._id.toString()
      );

      if (newItem.type === "course") {
        totalAmtPaid += newItem.price;
        return {
          ...existingItem,
          updatedAt: new Date(),
        };
      }

      const updatedQuantity =
        existingItem.cartQuantity +
        (newItem.cartQuantity ? newItem.cartQuantity : 1);
      totalAmtPaid += newItem.sellingRate * updatedQuantity;
      return {
        ...existingItem,
        cartQuantity: updatedQuantity,
        updatedAt: new Date(),
      };
    });

  const nonUpdatedExistingItems = existingItems
    .filter(
      (existingItem) =>
        !updatedExistingItems.some(
          (item) => item._id.toString() === existingItem._id.toString()
        )
    )
    .map((oldItem) => {
      if (oldItem.type === "course") {
        totalAmtPaid += oldItem.price;
        return {
          ...oldItem,
          updatedAt: new Date(),
        };
      }
      totalAmtPaid += oldItem.sellingRate * oldItem.cartQuantity;
      return {
        ...oldItem,
        cartQuantity: oldItem.cartQuantity,
        updatedAt: new Date(),
      };
    });

  const newItems = items.reduce((acc, newItem) => {
    const existingItem = existingItems.find(
      (item) => item._id.toString() === newItem._id.toString()
    );
    if (!existingItem) {
      const quantity = newItem.cartQuantity ? newItem.cartQuantity : 1;
      if (newItem.type !== "course") {
        totalAmtPaid += newItem.sellingRate * quantity;
      } else {
        totalAmtPaid += newItem.price * quantity;
      }
      acc.push({
        ...newItem,
        cartQuantity: quantity,
        updatedAt: new Date(),
      });
    }
    return acc;
  }, []);

  if (!cart) {
    const newCart = new Cart({
      user: userId,
      amountToBePaid: totalAmtPaid || 0,
      items: newItems,
    });
    await newCart.save();
    return newCart;
  }
  const existingItemsCombined =
    nonUpdatedExistingItems.concat(updatedExistingItems);
  const combined = existingItemsCombined.concat(newItems);

  await Cart.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        updatedAt: new Date(),
        amountToBePaid: totalAmtPaid||0,
        items: combined,
      },
    },
    { upsert: true, new: true }
  );

  return {
    message: "Cart Updated",
    cart: newItems,
  };
};

function encryptData(value) {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(process.env.CRYPTO_KEY, "hex"); // Ensure your key is in the correct format
  const iv = crypto.randomBytes(16); // Generate a random initialization vector

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Prepend the IV to the encrypted data
  const encryptedWithIv = iv.toString("hex") + ":" + encrypted;

  return encryptedWithIv;
}

function decryptData(encryptedWithIv) {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(process.env.CRYPTO_KEY, "hex"); // Ensure your key is in the correct format

  // Split the IV and encrypted data
  const [ivHex, encrypted] = encryptedWithIv.split(":");
  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

const validateToken = (req, res, next) => {
  if (
    req.headers["origin"] == "https://www.psymate.org" ||
    req.headers["origin"] == "http://localhost:3000"
  ) {
    return next();
  }

  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Missing token" });
  }
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    req.userId = decoded.userId;

    const user = await User.findOne({ uid: req.userId });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }
    req.user = user;
    next();
  });
};



const validateSocialToken = (req, res, next) => {

  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Missing token" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    // Retrieve userId from decoded token
    const userId = decoded.userId;

    try {
      // Find the user in the database by uid (assuming uid is a unique identifier in your user schema)
      const user = await User.findOne({ uid: userId });

      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      // Set the MongoDB ObjectId of the user in req._id
      req._id = user._id; // Assign the user's MongoDB ObjectId to req._id

      req.user = user; // Pass the user object if needed later
      next();
    } catch (error) {
      console.error("Error while finding user:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
};

module.exports = {
  generateRandomId,
  paginateQuery,
  sendPatientEmail,
  processContent,
  getAllUniqueTagsLowercased,
  createQuery,
  newCreateQuery,
  getPaginatedResults,
  sendWhatsAppMessage,
  addToCart,
  getTypeValue,
  encryptData,
  decryptData,
  parsePhoneNumber,
  parseDisplayName,
  sendOtp,
  validateToken,
  validateSocialToken,
};
