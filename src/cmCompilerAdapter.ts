'use strict';

import { cmConfig } from './cmConfig';
import { cmOutputChannel } from './cmOutputChannel';
import vscode = require('vscode');

import { LiveAutoCompleteIndexer } from './cmLiveIndexer';

var compilerContainer = require("node-cm/index.js");

export class cmCompilerAdapter {
    
    private indexer: LiveAutoCompleteIndexer;
    private channel: cmOutputChannel;
    private filePath: string;
    private compiler;
    private isStarted: boolean = false;
    private diagnostics: vscode.DiagnosticCollection;
    
    constructor( diagnostics: vscode.DiagnosticCollection, filePath: string ) {
        this.filePath = filePath;
        this.channel = new cmOutputChannel( diagnostics, filePath );
        this.indexer = new LiveAutoCompleteIndexer();
        this.diagnostics = diagnostics;
        
        this.compiler = new compilerContainer( {
            cmRoot: cmConfig.cmRoot(),
            onRead: (data) => {
                this.channel.write( data );
            }//,
            //debug: true
        });
        
        // this.start()
        // .then( (started) => {
        //     this.runAutoComplete();
        // });
    }
    
    public startWritingOutputFile() : void {
        this.channel.write( `[Contents of output channel will now be written to: ${this.filePath}]\n` );
        this.channel.writeOutputToFile = true;
    }
    
    public stopWritingOutputFile() : void {
        this.channel.writeOutputToFile = false;
        this.channel.write( "[Stopped writing output to file]\n" );
    }
    
    public start() : Thenable<boolean> {
        if ( this.isStarted ) return;
        
        return new Promise((resolve, reject) => {
            this.compiler.start()
            .then( (success) => {
                this.isStarted = success;
                this.runAutoComplete();
                resolve(success);  
            }, reject);
        });        
    }
    
    public runAutoComplete(force?: boolean) {
        if ( !force && !cmConfig.cmAutoCompleteEnabled() || !this.isStarted ) return; // for now if it's not started don't do it.
        this.diagnostics.clear();
        this.indexer.start( 
            (file) => { this.runCurrentFile( file ); } 
        );
    }
    
    public clean() {
        this.channel.clear();
        var results = this.compiler.clean();
        this.channel.write( "[INFO make clean-cm:]\n" );
        this.channel.write( "---------------------\n" );
        this.channel.write( results );
        this.channel.write( "---------------------\n" );
        this.channel.write( "[INFO CM Clean]\n" );
        this.isStarted = false;
    }
    
    public stop() {
        if ( !this.isStarted ) return;
        this.channel.clear();
        this.channel.write( "[INFO CM Killed]\n" );
        this.compiler.kill();
        this.isStarted = false;
    }
    
    public loadAllKnown( file: string ) {
        this.diagnostics.clear();
        this.startIfNotStarted().then( (succuess) => {
        //    this.compiler.write( "use cm.rs; updateParsedRs();" );
            console.log(file);
            this.compiler.write(`loadAll("${file.replace(/\\/g, "/")}");`);
        });
    }

    public compileWorkspace() {
        this.startIfNotStarted().then( (succuess) => {
            const path = vscode.workspace.rootPath.replace( /\\/g, "/" ) + "/";
            this.run( `{ use cm.runtime.util; compileAllBelow(CompileAllEnv("${path}")); }` );
        } );
    }
    
    public compileFile( file: string ) {
        this.diagnostics.clear();
        this.startIfNotStarted().then((success) => {
            this.compiler.compileFile( file );
        });    
    }
    
    public run( cmCode: string ) {
        this.diagnostics.clear();
        this.startIfNotStarted().then((success) => {
            this.compiler.write( cmCode );
        });
    }
    
    public runCurrentFile( file: string ) {
        this.diagnostics.clear();
        this.startIfNotStarted().then((success) => {
            this.compiler.runFile( file );
        });
    }
    
    public quitDebug() {
        if(!this.isStarted) return;
        
        this.compiler.quitDebug();
    }
    
    public goto( file: string, offset: number ): Thenable<vscode.Location> {
        return this.startIfNotStarted()
        .then( (success) => {
            var promise = this.channel.goToDefinitionPromise();
            file = file.replace( /\\/g, '/' ); // make sure we have the right slashses        
            this.compiler.write( `cm.runtime.refers("${file}", ${offset});` );
            return promise;    
        } );

    }
    
    private startIfNotStarted() : Thenable<boolean> {
        if(this.isStarted) 
            return new Promise((resolve, reject) => { resolve(true); });
        
        return this.start();
    }
}