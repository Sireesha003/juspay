import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import logger from './logger';  // Import the logger for logging the attempts
import { nodeMailer } from './configKeys';  // Import the config keys for environment variables

// Configure the transporter using SMTP and credentials from .env file
const transporter = nodemailer.createTransport({
  host: nodeMailer.emailHost,    // SMTP host (e.g., smtp.gmail.com)
  port: nodeMailer.emailPort,    // Port (587 for TLS)
  secure: false,                  // Set to true for port 465, false for port 587
  auth: {
    user: nodeMailer.emailUser, // Email address (from .env)
    pass: nodeMailer.emailPass  // Password or App Password (from .env)
  }
});

// Send email function with retry logic
const sendEmail = async (to, subject, templateName, data) => {
  let attempts = 0;
  const maxAttempts = 3;  // Maximum retry attempts

  while (attempts < maxAttempts) {
    try {
      // Define the absolute path for the email templates
      const templatePath = path.join(process.cwd(), 'templates', `${templateName}.ejs`);

      // Render the EJS template with the provided data
      const htmlContent = await ejs.renderFile(templatePath, data);

      // Email options setup
      const mailOptions = {
        from: process.env.EMAIL_SENDER,  // Sender email (from .env)
        to: to,                         // Receiver email
        subject: subject,               // Email subject
        html: htmlContent               // Rendered HTML content
      };

      // Send the email using Nodemailer
      const info = await transporter.sendMail(mailOptions);

      // Log success to the console and to the log files
      logger.info(`Email sent successfully to ${to} with subject: "${subject}"`);
      return info;  // Return the response for logging or handling
    } catch (error) {
      attempts++;

      // Log the error if sending fails
      logger.error(`Attempt ${attempts} to send email to ${to} failed. Error: ${error.message}`);

      if (attempts >= maxAttempts) {
        // After the final attempt, log the failure
        logger.error(`All ${maxAttempts} attempts to send email to ${to} failed.`);
        throw new Error(`Failed to send email after ${maxAttempts} attempts`);
      }
    }
  }
};

export default sendEmail;