// config/keys.js
export default {
    // twilio: {
    //   accountSid: process.env.TWILIO_ACCOUNT_SID,
    //   authToken: process.env.TWILIO_AUTH_TOKEN,
    // },
    // nodeMailer: {
    //   emailHost: process.env.EMAIL_HOST,
    //   emailPort: process.env.EMAIL_PORT,
    //   emailUser: process.env.EMAIL_USER,
    //   emailPass: process.env.EMAIL_PASS,
    // },
    aws3:{
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucketName: process.env.S3_BUCKET_NAME,
    }
  };  