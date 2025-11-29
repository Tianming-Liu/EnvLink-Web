export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const fetchJSON = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`加载失败: ${url}`);
  }
  return response.json();
};

export const flattenCoords = (geometry, push) => {
  if (!geometry) {
    return;
  }
  const { type, coordinates } = geometry;
  if (type === "Point") {
    push(coordinates);
  } else if (type === "LineString" || type === "MultiPoint") {
    coordinates.forEach(push);
  } else if (type === "MultiLineString" || type === "Polygon") {
    coordinates.forEach((segment) => segment.forEach(push));
  } else if (type === "MultiPolygon") {
    coordinates.forEach((polygon) =>
      polygon.forEach((ring) => ring.forEach(push))
    );
  } else if (type === "GeometryCollection") {
    geometry.geometries.forEach((child) => flattenCoords(child, push));
  }
};
