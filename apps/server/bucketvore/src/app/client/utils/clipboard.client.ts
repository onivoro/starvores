/**
 * Client-side utility for clipboard operations
 */

export async function copyToClipboard(text: string, element?: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    // Provide visual feedback if element is provided
    if (element) {
      const originalText = element.textContent || '';
      const originalBg = element.style.backgroundColor;

      element.textContent = '✓ Copied!';
      element.style.backgroundColor = 'var(--color-success)';

      setTimeout(() => {
        element.textContent = originalText;
        element.style.backgroundColor = originalBg;
      }, 1500);
    }

    return true;
  } catch (error) {
    console.error('Clipboard API failed:', error);

    // Fallback to prompt
    const userCopy = prompt('Copy to clipboard:', text);
    return userCopy !== null;
  }
}

export async function copyS3PathToClipboard(
  bucket: string,
  key: string,
  element?: HTMLElement
): Promise<void> {
  try {
    // Fetch bucket region
    const response = await fetch(`/api/buckets/${encodeURIComponent(bucket)}/region`);
    const data = await response.json();
    const region = data.region || 'us-east-1';

    // Construct HTTPS URL
    const url = `https://s3.${region}.amazonaws.com/${bucket}/${key}`;

    await copyToClipboard(url, element);
  } catch (error) {
    console.error('Error getting S3 URL:', error);

    // Fallback to s3:// protocol
    const s3Path = `s3://${bucket}/${key}`;
    prompt('Copy S3 path (fallback):', s3Path);
  }
}
