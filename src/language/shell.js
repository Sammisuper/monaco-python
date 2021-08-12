import * as monaco from 'monaco-editor';
import { listen } from 'vscode-ws-jsonrpc';
import {
    MonacoLanguageClient, CloseAction, ErrorAction,
    MonacoServices, createConnection
} from 'monaco-languageclient';
const ReconnectingWebSocket = require('reconnecting-websocket');

import { shell_keys } from './staticProvider';
import { getTokens } from './tokenizer';

var connected = false;

export function getShellReady(editor, url) {

    monaco.languages.register({
        id: 'shell',
        extensions: ['.sh'],
    });

    let languageService = true;

    monaco.languages.registerCompletionItemProvider('shell', {
        provideCompletionItems: function (model, position) {
            var word = model.getWordUntilPosition(position);
            var range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            };
            return {
                suggestions: createDependencyProposals(range, languageService, editor, word)
            };
        }
    });

    if (languageService) {
        MonacoServices.install(editor);

        console.log("using Web Socket URL = ", url);
        if (!connected) {
            const webSocket = createWebSocket(url);
            listen({
                webSocket,
                onConnection: connection => {
                    console.log("onConnection!")
                    connected = true;
                    // create and start the language client
                    const languageClient = createLanguageClient(connection);
                    const disposable = languageClient.start();
                    connection.onClose(() => disposable.dispose());
                }
            });
        }
    }
}


function createWebSocket(url) {
    const socketOptions = {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 10000,
        maxRetries: Infinity,
        debug: false
    };
    return new ReconnectingWebSocket(url, [], socketOptions);
}

function createLanguageClient(connection) {
    return new MonacoLanguageClient({
        name: "Sample Language Client",
        clientOptions: {
            // use a language id as a document selector        
            documentSelector: ['shell'],
            // disable the default error handler            
            errorHandler: {
                error: () => ErrorAction.Continue,
                closed: () => CloseAction.DoNotRestart
            },
        },
        // create a language client connection from the JSON RPC connection on demand
        connectionProvider: {
            get: (errorHandler, closeHandler) => {
                return Promise.resolve(createConnection(connection, errorHandler, closeHandler));
            }
        }
    });
}


function createDependencyProposals(range, languageService = false, editor, curWord) {
    let snippets = [];
    let keys = [];
    for (const item of shell_keys) {
        keys.push({
            label: item,
            kind: monaco.languages.CompletionItemKind.Keyword,
            documentation: "",
            insertText: item,
            range: range
        });
    }

    let words = [];
    let tokens = getTokens(editor.getModel().getValue());
    for (const item of tokens) {
        if (item != curWord.word) {
            words.push({
                label: item,
                kind: monaco.languages.CompletionItemKind.Text,
                documentation: "",
                insertText: item,
                range: range
            });
        }
    }

    if (languageService) {
        return snippets;
    } else {
        return snippets.concat(keys).concat(words);
    }
}