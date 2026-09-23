/** Keep chart payloads bounded while retaining visible gaps and segment edges. */
function downsample(points, maxPoints = 1200) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1 || index % step === 0) return true;
    const previous = points[index - 1];
    return (point.value === null) !== (previous.value === null) || point.segment !== previous.segment;
  });
}

module.exports = { downsample };
