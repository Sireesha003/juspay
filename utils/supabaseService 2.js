import supabase from './supabase.js';

/**
 * Uploads a file buffer to Supabase Storage.
 * @param {Buffer} buffer - The file buffer.
 * @param {string} filename - The clean filename.
 * @param {string} mimetype - The MIME type for correct content-type.
 * @param {string} bucketName - The Supabase bucket name.
 * @param {string} folder - The subfolder within the bucket.
 * @returns {Promise<string|null>} - The public URL of the uploaded file.
 */
export const uploadToSupabase = async (buffer, filename, mimetype, bucketName = 'vehicles', folder = 'documents') => {
  try {
    // Ensure bucket exists
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.error('❌ Supabase bucket error:', bucketError.message);
    } else {
      const bucketExists = buckets.find(b => b.name === bucketName);
      if (!bucketExists) {
        console.log(`📦 Creating bucket: ${bucketName}...`);
        await supabase.storage.createBucket(bucketName, { public: true });
      }
    }

    // Sanitize filename to avoid "Invalid key" errors with special characters/spaces
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFilename = `${Date.now()}-${sanitizedFilename}`;
    const filePath = `${folder}/${uniqueFilename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: mimetype,
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('❌ Supabase Upload Error:', error.message);
    return null;
  }
};
