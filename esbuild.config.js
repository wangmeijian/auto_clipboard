require ( 'esbuild' ).build({
  entryPoints : [ 'popup.tx' ],
  bundle : true ,
  outfile : 'popup.js' ,
}).catch( () => process.exit( 1 ))