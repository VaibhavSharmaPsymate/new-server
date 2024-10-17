const { S3 } = require("aws-sdk");
const fs = require('fs');

const s3Social = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION // ensure to specify the correct region
});

exports.uploadToS3Bucket = async (files) => {

  const params = files.map((file) => {
    console.log(file);
    return {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: file.path ? `/${file.path}/${file.originalname}` : file.originalname,
      Body: file.buffer,
    };
  });

  return await Promise.all(params.map((param) => s3Social.upload(param).promise()));
};



exports.uploadFileToSocialS3 = async (filePath, fileName) => {
  try {
    // Validate the file path before reading
    if (!fs.existsSync(filePath)) {
      console.error('File does not exist at path:', filePath);
      throw new Error('Invalid file path');
    }

    const fileContent = fs.readFileSync(filePath); // Read the file content

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `psymateSocial/${fileName}`,
      Body: fileContent,
      ACL: 'public-read', // Optional: set permissions
    };

    const result = await s3Social.upload(params).promise();
    return {
      url: result.Location,
      key: result.Key,
    };
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw new Error('Error uploading file');
  }
};