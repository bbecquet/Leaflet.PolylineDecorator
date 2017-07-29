import resolve from 'rollup-plugin-node-resolve';

export default {
  entry: 'src/L.PolylineDecorator.js',
  dest: 'dist/leaflet.polylineDecorator.js',
  format: 'es',
  plugins: [ resolve() ],
};
