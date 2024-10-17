const { Project, validateProject } = require("../../../schemas/Project");
const catchAsyncErrors = require("../../../middleware/catchAsyncErrors");
const { default: axios } = require("axios");
const { uploadToS3Bucket } = require("../../../utils/s3Service");
const os = require("os");
const fs = require("fs");
const path = require("path");

const axiosPsypackInstance = () => {
  return axios.create({
    baseURL: process.env.PSYPACK_API_BASE_URL,
    headers: {
      clientId: process.env.PSYPACK_CLIENT_ID,
      clientSecret: process.env.PSYPACK_CLIENT_SECRET,
    },
  });
};

const getallAssessments = catchAsyncErrors(async (req, res) => {
  const psypack = axiosPsypackInstance();

  try {
    const response = await psypack.get("get-assessments");
    const assessments = response.data.assessments; // Assuming assessments is a property of the returned data

    return res.status(200).json({
      message: "RETURN ASSESSMENTS",
      data: assessments,
    });
  } catch (error) {
    console.error("Error fetching assessments:", error);
    return res.status(error.response?.status || 500).json({
      message: "Failed to fetch assessments",
      error: error.message,
    });
  }
});

const getPsychoEducation = catchAsyncErrors(async (req, res) => {
  const { id } = req.params;
  const psypack = axiosPsypackInstance();

  try {
    const response = await psypack.get("psychoEducation/" + id);
    const assessments = response.data.assessments; // Assuming assessments is a property of the returned data

    return res.status(200).json({
      message: "RETURN Psycho Education",
      data: assessments,
    });
  } catch (error) {
    console.error("Error fetching assessments:", error);
    return res.status(error.response?.status || 500).json({
      message: "Failed to fetch assessments",
      error: error.message,
    });
  }
});

const generateReport = catchAsyncErrors(async (req, res) => {
  const psypack = axiosPsypackInstance();

  try {
    const response = await psypack.post("report/generate-report/", req.body);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Error fetching assessments:", error.response.data);
    return res.status(error.response?.status || 500).json(error.response.data);
  }
});

const getReport = catchAsyncErrors(async (req, res) => {
  const { id } = req.params;
  const tempFileName = `report_${id}`;
  const tempFilePath = path.join(os.tmpdir(), `${tempFileName}.pdf`);

  const psypack = axiosPsypackInstance();

  try {
    const response = await psypack.post(`report/${id}/pdf`, req.body, {
      responseType: "arraybuffer",
    });
    const pdfData = response.data;

    fs.writeFile(tempFilePath, pdfData, "binary", async (writeError) => {
      if (writeError) {
        console.error("Error writing PDF file:", writeError);
        return res.status(500).json({ message: "Error writing PDF file" });
      }

      try {
        const uploadToS3 = await uploadToS3Bucket([
          {
            originalname: tempFilePath,
            buffer: fs.readFileSync(tempFilePath),
            filename: "invoices",
          },
        ]);

        console.log("Uploaded invoice to S3: ", uploadToS3[0].Location);
        fs.unlinkSync(tempFilePath);

        return res.status(200).json(uploadToS3[0].Location);
      } catch (uploadError) {
        console.error("Error uploading to S3:", uploadError);
        return res.status(500).json({ message: "Error uploading to S3" });
      }
    });
  } catch (error) {
    console.error(
      "Error fetching assessments:",
      error?.response?.data || error.message
    );
    return res
      .status(error?.response?.status || 500)
      .json(error?.response?.data || { message: "Internal Server Error" });
  }
});

module.exports = {
  getallAssessments,
  getPsychoEducation,
  generateReport,
  getReport,
};
