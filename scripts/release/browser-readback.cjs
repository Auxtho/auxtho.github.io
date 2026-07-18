function findBrokenImageSources(images) {
  return images.flatMap((image) => {
    if (!image.source) {
      if (image.inactiveSampleLightboxPlaceholder === true) return [];
      return [`missing-src:${image.descriptor || 'img'}`];
    }
    if (image.complete && image.naturalWidth > 0) return [];
    return [image.source];
  });
}

module.exports = { findBrokenImageSources };
