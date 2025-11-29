// utils/imageResizer.js
export const resizeImage = (file, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = URL.createObjectURL(file);
      image.onload = () => {
        const canvas = document.createElement('canvas');
        let width = image.width;
        let height = image.height;
  
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }
  
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
  
        canvas.toBlob((blob) => {
            if (blob) {
                const resizedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                resolve(resizedFile);
            } else {
                reject(new Error('Image resizing failed'));
            }
        }, 'image/jpeg', quality);
      };
      image.onerror = (error) => reject(error);
    });
  };