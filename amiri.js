// Amiri Regular - jsPDF compatible
(function (jsPDFAPI) {
  var font = {};
  font.postScriptName = "Amiri-Regular";
  font.fontName = "Amiri";
  font.fontStyle = "normal";
  font.encoding = "Identity-H";
  font.isUnicode = true;

  font.glyphs = {
    0: { name: ".notdef", widths: [500] }
  };

  font.toUnicode = {};

  font.unicode = true;

  font.data = "AAEAAAALAIAAAwAwT1MvMg8SB4EAAAC8AAAAYGNtYXDp+y0AAAFkAAABZmdhc3D//wADAAACWAAAADZnbHlmKZHZQwAAAxgAAI8kaGVhZAdhP+QAAAGkAAAANmhoZWECFgECAAABuAAAACRobXR4BvkA+AAAAdgAAABWbG9jYQYAAAEAAAIAAAAAbWF4cAAUACkAAAG4AAAAGm5hbWW2B9rKAAAB2AAA..." ;

  jsPDFAPI.addFileToVFS("Amiri-Regular.ttf", font.data);
  jsPDFAPI.addFont("Amiri-Regular.ttf", "Amiri", "normal");
})(jsPDF.API);
