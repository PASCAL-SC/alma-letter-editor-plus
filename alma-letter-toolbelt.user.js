// ==UserScript==
// @name         Alma Letter Editor Plus
// @namespace    https://github.com/PASCAL-SC/alma-letter-editor-plus
// @version      1.0.0
// @description  Monaco editor, condition builder, and UX enhancements for Ex Libris Alma letter editor
// @match        https://*.alma.exlibrisgroup.com/ng/letterEditor/letters?*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/PASCAL-SC/alma-letter-editor-plus/main/alma-letter-toolbelt.user.js
// @updateURL    https://raw.githubusercontent.com/PASCAL-SC/alma-letter-editor-plus/main/alma-letter-toolbelt.user.js
// ==/UserScript==
(function () {

    // https://jsfiddle.net/ykw5thLr/4/ for condition builder fiddle
    /* ================= Global Vars ===============================*/

    let detachedPreviewWindow = null;
    let originalIframe = null;
    let previewCheckInterval = null;

    // Global logging flag
    const LOGGING_ENABLED = true;

    const log = (...args) => {
        if (LOGGING_ENABLED) console.log(...args);
    };
    const warn = (...args) => {
        if (LOGGING_ENABLED) console.warn(...args);
    };
    const error = (...args) => {
        if (LOGGING_ENABLED) console.error(...args);
    };

    /* ======================= Clocks =========================== */

    // waits for the xsl ace textbox. If found then the xml one loaded too
    const waitForAceEditor = async () => {
        const aceXslWrapper = document.querySelector('#xsl-letter > ex-ace-editor');
        const aceXmlWrapper = document.querySelector('#xml-letter > ex-ace-editor');
        if (aceXslWrapper && aceXmlWrapper && !aceXslWrapper.dataset.monacoInjected) {
            const xslEditor = await replaceAce(aceXslWrapper, 'xsl');
            const xmlEditor = await replaceAce(aceXmlWrapper, 'xml');
            addNavMenu(); // nav bar added here so i don't have to global the Editor vars for the update preview button
            updatePreviewButton(xslEditor, xmlEditor);
            bindPreviewToSaveClick();
        } else {
            setTimeout(waitForAceEditor, 500);
        }
    };

    // Check if the detached window has been closed
    function startWindowMonitor() {
        if (previewCheckInterval) clearInterval(previewCheckInterval);

        previewCheckInterval = setInterval(() => {
            if (detachedPreviewWindow && detachedPreviewWindow.closed) {
                console.log('Detached preview window closed.');
                reattachIframe();
            }
        }, 1000); // Check every second
    }

    /* ======================= Animation Functions (Have to be extra) =========================== */

    const fadeIn = (element, duration = 1000) => {
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '1';
    };

    const fadeOut = (element, duration = 1000) => {
        element.style.transition = `opacity ${duration}ms ease-in-out`;
        element.style.opacity = '0';
    };

    /* ================ Monaco Init =================================*/

    // Add/load monaco
    const loadMonaco = () => {
        return new Promise((resolve) => {
            if (window.monaco) return resolve(window.monaco);
            const loader = document.createElement('script');
            loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js';
            loader.onload = () => {
                require.config({
                    paths: {
                        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs',
                    },
                });
                require(['vs/editor/editor.main'], () => {
                    registerXslLanguage(window.monaco);
                    resolve(window.monaco);
                });
            };
            document.body.appendChild(loader);
        });
    };

    // Config for monaco
    const registerXslLanguage = (monaco) => {
        monaco.languages.register({
            id: 'xsl',
        });
        // need both tokenizers for html and xsl
        monaco.languages.setMonarchTokensProvider('xsl', {
            tokenizer: {
                root: [
                    // HTML tags
                    [/(<!\[
]>/, 'metatag'],
                    [/(<!--)/, 'comment', '@comment'],
                    [/(<)(\w+)(\/>)/, ['delimiter', 'tag', 'delimiter']],
                    [/(<)([\w\-]+)(\s*)(>)/, ['delimiter', 'tag', '', 'delimiter']],
                    [/(<\/)([\w\-]+)(>)/, ['delimiter', 'tag', 'delimiter']],
                    [/[\w\-]+=/, 'attribute.name'],
                    [/"/, {
                        token: 'string.quote',
                        bracket: '@open',
                        next: '@string',
                    }],

                    // XSL tags
                    [/(<)(xsl:[\w\-]+)(\s*)(>)/, ['delimiter', 'keyword', '', 'delimiter']],
                    [/(<\/)(xsl:[\w\-]+)(>)/, ['delimiter', 'keyword', 'delimiter']],
                    [/(<)(xsl:[\w\-]+)(\/>)/, ['delimiter', 'keyword', 'delimiter']],
                ],
                comment: [
                    [/-->/, 'comment', '@pop'],
                    [/[^-]+/, 'comment'],
                    [/./, 'comment'],
                ],
                string: [
                    [/[^"]+/, 'string'],
                    [/"/, {
                        token: 'string.quote',
                        bracket: '@close',
                        next: '@pop',
                    }],
                ],
            },
        });

        // Set language configuration for auto-closing brackets and comments
        monaco.languages.setLanguageConfiguration('xsl', {
            autoClosingPairs: [{
                open: '<', close:'>' , }, { open:'"' , close:'"' , }, { open:'{' , close:'}' , }, ], surroundingPairs: [{ open:'<' , close:'>' , }, { open:'"' , close:'"' , }, { open:'{' , close:'}' , }, ], comments: { lineComment:'//' , blockComment: ['<!--','-->' ], }, }); auto complete labels. Follow the same process as ones below to add another monaco.languages.registerCompletionItemProvider('xsl', { provideCompletionItems: ()=> {
                const suggestions = [{
                    label: 'xsl:template',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: '<xsl:template match="${1:/}">\n\t$0\n</xsl:template>',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'XSL Template block',
                },
                                     {
                                         label: 'xsl:value-of',
                                         kind: monaco.languages.CompletionItemKind.Snippet,
                                         insertText: '<xsl:value-of select="${1:path}"/>',
                                         insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                         documentation: 'XSL Value Of',
                                     },
                                     {
                                         label: 'xsl:if',
                                         kind: monaco.languages.CompletionItemKind.Snippet,
                                         insertText: '<xsl:if test="${1:condition}">\n\t$0\n</xsl:if>',
                                         insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                         documentation: 'XSL If Condition',
                                     },
                                     {
                                         label: 'xsl:choose',
                                         kind: monaco.languages.CompletionItemKind.Snippet,
                                         insertText: '<xsl:choose>\n\t<xsl:when test="${1:condition}">\n\t\t$0\n\t</xsl:when>\n\t<xsl:otherwise>\n\t</xsl:otherwise>\n</xsl:choose>',
                                         insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                         documentation: 'XSL Choose/When/Otherwise',
                                     },
                                    ];
                return {
                    suggestions,
                };
            },
        });
        log('XSL language registered');
    };

    const replaceAce = async (aceWrapper, language) => {
        const monacoContainer = document.createElement('div');
        monacoContainer.style.width = '100%';
        monacoContainer.style.height = '100vh';
        monacoContainer.style.border = '1px solid #ccc';
        monacoContainer.style.marginTop = '10px';
        monacoContainer.style.position = 'relative';
        monacoContainer.style.zIndex = '3';
        monacoContainer.style.opacity = '0';

        aceWrapper.style.pointerEvents = 'none';
        aceWrapper.style.opacity = '1';
        aceWrapper.style.position = 'absolute';
        aceWrapper.style.zIndex = '1';

        aceWrapper.dataset.monacoInjected = 'true';
        aceWrapper.parentNode.insertBefore(monacoContainer, aceWrapper.nextSibling);

        const value = getInitialAceText(aceWrapper);
        const monaco = await loadMonaco();

        const editor = monaco.editor.create(monacoContainer, {
            value,
            language: language,
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: {
                enabled: false,
            },
            wordWrap: 'on',
            stickyScroll: {
                enabled: false,
            },
        });

        // Store the editor in a global object
        if (!window.monacoEditors) window.monacoEditors = {};
        window.monacoEditors[language] = editor;
        fadeOut(aceWrapper, 1000);
        fadeIn(monacoContainer, 1000);

        // Automatically clean up duplicate angle brackets on content change
        editor.onDidChangeModelContent(() => {
            cleanMonacoText(editor);
        });
        setupEToolsSubMenu(editor);

        log(`Monaco editor for ${language} initialized.`);

        return editor;
    };

    /* ======================= Monaco context menu functions =============*/

    function addContextMenuAction(editor, actionId, label, group, order, actionFunction) {
        editor.addAction({
            id: actionId,
            label: label,
            contextMenuGroupId: group,
            contextMenuOrder: order,
            run: actionFunction,
        });
    }

    function setupEToolsSubMenu(editor) {
        // function to add actions under the "Editor Tools" group
        function addEToolAction(id, label, order, callback) {
            editor.addAction({
                id: `editor-tools-${id}`,
                label: label,
                contextMenuGroupId: 'editor-tools',
                contextMenuOrder: order,
                run: callback,
            });
        }

        // Toggle Sticky Scroll
        addEToolAction('toggle-sticky-scroll', 'Toggle Sticky Scroll', 1, () => {
            const config = editor.getOption(monaco.editor.EditorOption.stickyScroll);
            editor.updateOptions({
                stickyScroll: {
                    enabled: !config.enabled,
                },
            });
        });

        // Toggle Word Wrap
        addEToolAction('toggle-word-wrap', 'Toggle Word Wrap', 2, () => {
            const wrap = editor.getOption(monaco.editor.EditorOption.wordWrap);
            editor.updateOptions({
                wordWrap: wrap === 'on' ? 'off' : 'on',
            });
        });

        // Toggle Minimap
        addEToolAction('toggle-minimap', 'Toggle Minimap', 3, () => {
            const minimap = editor.getOption(monaco.editor.EditorOption.minimap).enabled;
            editor.updateOptions({
                minimap: {
                    enabled: !minimap,
                },
            });
        });

        // I'm not sure if this is useful, but maybe it might be
        // Insert Timestamp
        addEToolAction('insert-timestamp', 'Insert ISO Timestamp', 4, () => {
            const pos = editor.getPosition();
            const timestamp = new Date().toISOString();
            editor.executeEdits('', [{
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text: timestamp,
                forceMoveMarkers: true,
            }]);
        });

        // Format Document
        addEToolAction('format-document', 'Format Document', 5, () => {
            editor.getAction('editor.action.formatDocument').run();
        });

        log('Editor Tools context menu added.');
    }

    /* ========================= Helpers =================*/

    // used to clean various text issues
    // First cleanup is to remove any instances of << or>>. This is due to if a user types <xsl:.. for autocomplete it will add an
		< and> to the end which becomes a problem
    // no second cleanup yet
    const cleanMonacoText = (editor) => {
        const model = editor.getModel();
        if (model) {
            const value = model.getValue();
            // Correctly replace duplicate angle brackets
            const cleanedValue = value.replace(/<<+ g,'<' ).replace(/>>+/g, '>');

            // Only apply edit if there's a change
            if (value !== cleanedValue) {
                const position = editor.getPosition();
                const range = new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));

                // applyEdits to keep the undo stack
                model.applyEdits([{
                    range: range,
                    text: cleanedValue,
                    forceMoveMarkers: true,
                }]);

                // Put cursor back in the right spot
                editor.setPosition(position);
                // log('Removed duplicate angle brackets');
            }
        }
    };

    const getInitialAceText = (aceWrapper) => {
        try {
            const aceDiv = aceWrapper.querySelector('.ace_editor');
            const aceInstance = aceDiv?.env?.editor;
            return aceInstance?.getValue() || '';
        } catch (e) {
            console.warn('Could not get ACE content.', e);
            return '';
        }
    };

    const applyTextToAce = () => {
        try {
            // Get both ACE editor wrappers (XSL and XML)
            const aceWrappers = [
                document.querySelector('#xsl-letter > ex-ace-editor'),
                document.querySelector('#xml-letter > ex-ace-editor'),
            ];

            aceWrappers.forEach((aceWrapper, index) => {
                if (!aceWrapper) {
                    console.warn('Could not find ACE wrapper.');
                    return;
                }

                const aceDiv = aceWrapper.querySelector('.ace_editor');
                const aceInstance = aceDiv?.env?.editor;
                const textarea = aceWrapper.querySelector('ex-ace-editor > div > textarea');

                if (!aceInstance || !textarea) {
                    console.error('Could not find ACE instance or textarea in wrapper:', aceWrapper);
                    return;
                }

                // Get the current value from Monaco editor
                const monacoEditor = index === 0 ? window.monacoEditors.xsl : window.monacoEditors.xml;
                const value = monacoEditor.getValue();

                // Apply the value to the ACE editor
                const doc = aceInstance.getSession().getDocument();
                const oldLines = doc.getAllLines();
                const fullRange = {
                    start: {
                        row: 0,
                        column: 0,
                    },
                    end: {
                        row: oldLines.length,
                        column: oldLines[oldLines.length - 1].length,
                    },
                };
                doc.replace(fullRange, value);

                // Sync with textarea
                textarea.value = '';
                textarea.dispatchEvent(new Event('input', {
                    bubbles: true,
                }));
                textarea.dispatchEvent(new Event('change', {
                    bubbles: true,
                }));

                log(`Applied changes to ACE editor: ${index === 0 ? 'XSL' : 'XML'}`);
            });

            // Save Draft Button Click
            // debating using this function
            /*
                  const saveButton = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent?.trim() === 'Save Draft');
                  if (saveButton) {
                      saveButton.click();
                      log('Save Draft button clicked');
                  } else {
                      console.warn('Save Draft button not found');
                  }
                  */

            log('Applied changes to both ACE editors.');
        } catch (e) {
            console.error('Failed to apply changes to both ACE editors:', e);
        }
    };

    // Toggle between detached and attached preview
    function toggleDetachPreview() {
        const btn = document.getElementById('detach-preview-button');

        if (!detachedPreviewWindow || detachedPreviewWindow.closed) {
            // Detach: Open a new window and move the iframe
            detachedPreviewWindow = window.open('', 'DetachedPreview', 'width=800,height=600');
            detachedPreviewWindow.document.title = 'Detached Preview';
            detachedPreviewWindow.document.body.style.margin = '0';
            detachedPreviewWindow.document.body.style.padding = '0';

            // Find the preview iframe in Alma's page
            originalIframe = document.querySelector('letter-html-visual iframe.letter-iframe');
            if (!originalIframe) {
                console.error('Could not find the preview iframe.');
                return;
            }

            // Move the iframe to the new window
            detachedPreviewWindow.document.body.appendChild(originalIframe);
            originalIframe.style.width = '100%';
            originalIframe.style.height = '100%';
            originalIframe.style.border = 'none';

            document.getElementsByClassName('editors')[0].style.width = '100%';
            document.getElementById('html-letter').style.display = 'none';

            // Start monitoring if the window gets closed
            startWindowMonitor();

            btn.textContent = 'Attach Preview';
            console.log('Preview detached');
        } else {
            // Attach: Move the iframe back and close the detached window
            reattachIframe();
        }
    }

    // Reattach the iframe if the detached window is closed
    function reattachIframe() {
        const btn = document.getElementById('detach-preview-button');
        const previewContainer = document.querySelector('letter-html-visual');
        if (previewContainer && originalIframe) {
            previewContainer.appendChild(originalIframe);
        }
        if (detachedPreviewWindow) {
            detachedPreviewWindow.close();
            detachedPreviewWindow = null;
        }
        clearInterval(previewCheckInterval);
        document.getElementsByClassName('editors')[0].style.width = '50%';
        document.getElementById('html-letter').style.display = '';
        btn.textContent = 'Detach Preview';

        // Force Monaco editor layout recalculation
        // This forces the page to reset the monaco boxes. Otherwise they would stay stuck behind the preview div
        Object.values(window.monacoEditors).forEach((editor) => {
            const container = editor.getContainerDomNode();
            container.style.width = '0%';
            setTimeout(() => {
                container.style.width = '100%';
            }, 50); // delay to ensure reflow b/c otherwise it stops
        });
        console.log('Preview reattached');
    }

    /* =========================== Events ===============================*/

    document.addEventListener('click', function (event) {
        // Check if the clicked element is a link inside the letters table
        const link = event.target.closest('#TABLE_DATA_lettersOnPage a');
        if (link) {
            log('Link clicked: Re-initializing editors');

            // Trigger the editor setup
            waitForAceEditor();
        }
    });

    function bindPreviewToSaveClick() {
    const saveBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent.trim() === 'Save');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            applyTextToAce();
        });
    } else {
        console.warn('Save button not found to bind preview update.');
    }
}

    /* =============================== Condition Builder ==========================*/
    function toggleConditionBuilder() {
        const builder = document.getElementById('condition-builder');
        const overlay = document.getElementById('condition-builder-overlay');
        const isHidden = builder.style.display === 'none';

        builder.style.display = isHidden ? 'table' : 'none';
        if (overlay) overlay.style.display = isHidden ? 'block' : 'none';

        if (isHidden) {
            // When showing the builder, rebuild the FancyTree
            const xmlString = window.monacoEditors.xml.getValue() || '<empty/>';

            // Clear previous tree contents
            const treeContainer = document.getElementById('builder-right-pane');
            if (treeContainer && $.ui.fancytree.getTree(treeContainer)) {
                $(treeContainer).fancytree('destroy');
            }

            initializeFancyTree(xmlString);
        }
    }


    function initializeFancyTree(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString.trim(), 'application/xml');

        function xmlToFancyTree(node) {
            const children = [];

            node.childNodes.forEach((child) => {
                if (child.nodeType === 1) { // ELEMENT_NODE
                    const grandChildren = xmlToFancyTree(child);
                    const textContent = child.textContent.trim();

                    const isLeaf = grandChildren.length === 0;

                    const childNode = {
                        title: child.nodeName,
                        children: isLeaf ? null : grandChildren,
                        icon: !isLeaf,
                        extraClasses: isLeaf ? 'fancytree-leaf-node' : '',
                    };

                    // Append text content for leaf nodes
                    if (isLeaf && textContent) {
                        childNode.title += `: ${textContent}`;
                    } else if (isLeaf && !textContent) {
                        childNode.title += ': [Empty]';
                    }

                    children.push(childNode);
                }
            });

            return children;
        }

        const treeData = [{
            title: xmlDoc.documentElement.nodeName,
            expanded: false,
            children: xmlToFancyTree(xmlDoc.documentElement),
        }];

        $('#builder-right-pane').fancytree({
            source: treeData,
            checkbox: false,
            selectMode: 1,
            connectors: true,
            icon: false,
            click: function (event, data) {
                if (data.node.isSelected()) {
                    data.node.setSelected(false);
                } else {
                    data.node.setSelected(true);
                }
            },
        });
        // adds the connector lines
        $('.fancytree-container').addClass('fancytree-connectors');
    }


    // See https://jsfiddle.net/MemeProof/mar7vcd6/ for specifics
    const xslBuilders = {
        'If Statement': {
            extract: () => {
                const container = document.querySelector('.xsl-template');
                const path =
                      container.querySelector('button.node-button')?.textContent || '[path]';
                const operator = container.querySelector('select')?.value || '[operator]';
                const value = container.querySelector('input')?.value || '[value]';
                return `<xsl:if test="${path} ${operator} '${value}'">
				<!-- Put your code here for what happens if the condition is true <br> you can also get rid of the operator and textbox and just check if the node exists by just doing something like test="node you want to check"-->
			</xsl:if>`;
                },
            },
            'Choose/When/Otherwise': {
                extract: () => {
                    const container = document.querySelector('.xsl-template');
                    const path =
                          container.querySelector('button.node-button')?.textContent || '[path]';
                    return `<xsl:choose>
				<xsl:when test="${path}">Much like the if statement, you can do a condition like is user/user_group = student <br> In this case we are testing if the node exist, then do this</xsl:when>
					<!--You can do multiple <xsl:when...> if you have multiple conditions you want to test for</br>Like if you want to change text based on different user_groups <br> just keep each <xsl:when...> inside the <xsl:choose> tags-->
					<xsl:otherwise>Otherwise, do this instead</xsl:otherwise>
				</xsl:choose>`;
                },
            },
            'For-Each': {
                extract: () => {
                    const container = document.querySelector('.xsl-template');
                    const path =
                          container.querySelector('button.node-button')?.textContent || '[path]';
                    return `<xsl:for-each select="${path}">
  Do the following thing for each instance of the node chosen
</xsl:for-each>`;
                },
            },
            'Value-Of': {
                extract: () => {
                    const container = document.querySelector('.xsl-template');
                    const path =
                          container.querySelector('button.node-button')?.textContent || '[path]';
                    return `<xsl:value-of select="${path}"/>`;
                },
            },
            'Sort': {
                extract: () => {
                    const container = document.querySelector('.xsl-template');
                    const path =
                          container.querySelector('button.node-button')?.textContent || '[path]';
                    return `<xsl:sort select="${path}" order="ascending"/>`;
                },
            },
        };

    function loadFancyTree(callback) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href =
            'https://cdnjs.cloudflare.com/ajax/libs/jquery.fancytree/2.38.1/skin-win8/ui.fancytree.min.css';
        document.head.appendChild(link);

        const scriptJQ = document.createElement('script');
        // i'm sure alma has jquery, but i think it's not accesible so this makes life easier
        // so i can jsut copy paste some of the fancytree code examples. Never used it before now
        scriptJQ.src =
            'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js';
        scriptJQ.onload = () => {
            const scriptFT = document.createElement('script');
            scriptFT.src =
                'https://cdnjs.cloudflare.com/ajax/libs/jquery.fancytree/2.38.1/jquery.fancytree-all-deps.min.js';
            scriptFT.onload = callback;
            document.head.appendChild(scriptFT);
        };
        document.head.appendChild(scriptJQ);
    }

    function addTreeControlButtons() {
        const controlDiv = document.createElement('div');
        controlDiv.id = 'tree-controls';
        controlDiv.style.display = 'flex';
        controlDiv.style.marginBottom = '5px';

        const collapseButton = document.createElement('button');
        collapseButton.textContent = 'Collapse All';
        collapseButton.onclick = () => {
            const tree = $.ui.fancytree.getTree('#builder-right-pane');
            if (tree) {
                tree.visit(function (node) {
                    node.setExpanded(false);
                });
            }
        };
        controlDiv.appendChild(collapseButton);

        const toggleEmptyCheckbox = document.createElement('input');
        toggleEmptyCheckbox.type = 'checkbox';
        toggleEmptyCheckbox.id = 'toggleEmpty';
        toggleEmptyCheckbox.checked = true;

        const toggleEmptyLabel = document.createElement('label');
        toggleEmptyLabel.htmlFor = 'toggleEmpty';
        toggleEmptyLabel.textContent = ' Show Empty Nodes';

        toggleEmptyCheckbox.addEventListener('change', () => {
            const showEmpty = toggleEmptyCheckbox.checked;
            const tree = $.ui.fancytree.getTree('#builder-right-pane');
            if (tree) {
                tree.visit(function (node) {
                    if (node.title.includes('[Empty]')) {
                        node.toggleClass('hidden-node', !showEmpty);
                    }
                });
            }
        });

        controlDiv.appendChild(collapseButton);
        controlDiv.appendChild(toggleEmptyCheckbox);
        controlDiv.appendChild(toggleEmptyLabel);

        const rightPane = document.getElementById('builder-right-wrapper');
        rightPane.insertBefore(controlDiv, rightPane.firstChild);
    }

    function createConditionBuilder() {
        const builder = document.createElement('table');
        builder.id = 'condition-builder';
        builder.style.display = 'none';

        const row = document.createElement('tr');

        const leftPane = document.createElement('td');
        leftPane.id = 'conditions-pane';
        leftPane.innerHTML = `
        <h1>Conditions</h1>
				<button class="value" onclick="ifStatment()">If Statement</button>
				<button class="value" onclick="chooseWhenOtherwiseStatement()">Choose/When/Otherwise</button>
				<button class="value" onclick="forEachStatement()">For-Each</button>
				<button class="value" onclick="valueOfStatement()">Value-Of</button>
				<button class="value" onclick="sortStatement()">Sort</button>
    `;

            const middlePane = document.createElement('td');
            middlePane.id = 'middle-pane';
            middlePane.innerHTML = `
        <h1>Condition Builder</h1>
				<div id="condition-output"/>
    `;
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'condition-builder-overlay';
        overlay.style.display = 'none'; // start hidden
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
            builder.style.display = 'none';
            overlay.style.display = 'none';
        });


            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy to Clipboard';
            copyButton.onclick = copyToClipboard;
            middlePane.appendChild(copyButton);

            const closeButton = document.createElement('button');
            closeButton.textContent = 'Cancel';
            closeButton.onclick = toggleConditionBuilder;
            middlePane.appendChild(closeButton);

            const rightPane = document.createElement('td');
            rightPane.id = 'builder-right-wrapper';
            rightPane.innerHTML = '<div id="builder-right-pane"/>';

            row.appendChild(leftPane);
            row.appendChild(middlePane);
            row.appendChild(rightPane);
            builder.appendChild(row);

            const helpRow = document.createElement('tr');
            const helpCell = document.createElement('td');
            helpCell.id = 'helpText';
            helpCell.colSpan = 3;
            helpCell.textContent =
                'Select a condition to start building your conditional statement.';
            helpRow.appendChild(helpCell);
            builder.appendChild(helpRow);
            document.body.appendChild(builder);

            const xmlAce = document.querySelector('#xml-letter > ex-ace-editor');
            const xmlString = getInitialAceText(xmlAce)
            initializeFancyTree(xmlString);
        }


    function addToggleButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Condition Builder';
        btn.onclick = toggleConditionBuilder;
        document.body.appendChild(btn);
    }

    function copyToClipboard() {
        const templateDiv = document.querySelector('.xsl-template');

        const templateType = templateDiv.dataset.template;

        const builder = xslBuilders[templateType];
        if (!builder || !builder.extract) {
            alert('No extract function for this template.');
            return;
        }

        const xsl = builder.extract();
        // i'm not a fan of using alerts so i might try something different later
        navigator.clipboard.writeText(xsl).then(() => {
            alert('XSL Snippet copied to clipboard');
        });
    }

    // might edit this a little more later
    function updateHelpText(command) {
        const helpInfo = {
            'If Statement': {
                text: 'The \'if\' element in XSLT is used to perform conditional logic. It allows you to test if a certain condition is true and then output something based on that. For example, if you want to change a label based user_group. You can specifiy what user_group you want the text to appear for.',
                link: 'https://www.w3schools.com/xml/xsl_if.asp',
            },
            'Choose/When/Otherwise': {
                text: 'The \'choose\' element is like a switch statement. It helps you pick one option from many. You use \'when\' to specify conditions and \'otherwise\' as a fallback. For example, you might display \'Available\', \'Out of Stock\', or \'Discontinued\' based on the product\'s status.',
                link: 'https://www.w3schools.com/xml/xsl_choose.asp',
            },
            'For-Each': {
                text: 'The \'for-each\' element loops through a set of nodes. This is useful when you want to display a list of items, like book titles from a catalog. You specify the node set, and the loop runs for each element within it.',
                link: 'https://www.w3schools.com/xml/xsl_for_each.asp',
            },
            'Value-Of': {
                text: 'The \'value-of\' element extracts and displays the value of a selected node. It’s like printing out a specific piece of information from your XML. For example, to show a book\'s title, you use this element.',
                link: 'https://www.w3schools.com/xml/xsl_value_of.asp',
            },
            'Sort': {
                text: 'The \'sort\' element is used inside a \'for-each\' to organize the output. For instance, you might want to list books by their titles alphabetically. The \'sort\' element lets you specify the sort key and order.',
                link: 'https://www.w3schools.com/xml/xsl_sort.asp',
            },
        };

        const helpDiv = document.getElementById('helpText');
        const info = helpInfo[command];
        if (info) {
            helpDiv.innerHTML = `<p>${info.text}</p>
				<a href='${info.link}' target='_blank'>Learn more at W3Schools</a>`;
        } else {
            helpDiv.innerHTML = '<p>No help available for this command.</p>';
        }
    }

    function attachHelpEvents() {
        const buttons = document.querySelectorAll('#conditions-pane .value');
        buttons.forEach((button) => {
            button.addEventListener('click', () => {
                updateHelpText(button.textContent);
            });
        });
    }

    // example of jquery making life easier
    function getSelectedNodeInfo(button, treeId) {
        const tree = $.ui.fancytree.getTree(treeId);
        const node = tree.getActiveNode();

        if (node) {
            const rawPath = node.getPath('/', 'title');
            const cleanedPath = rawPath
            .split('/')
            .map((segment) => segment.split(':')[0])
            .join('/');
            console.log('Path: ' + cleanedPath);

            // Update the button text with the selected node path
            if (button) {
                button.textContent = cleanedPath;
                button.dataset.nodePath = cleanedPath; // Store the path in the button for later
            }

            return {
                path,
                text,
            };
        } else {
            console.log('No node selected.');
            if (button) {
                button.textContent = 'No Node Selected';
            }
            return null;
        }
    }

    // might put some tooltip info on this
    function createNodeButton(id) {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = 'Get XML Info';
        button.classList.add('node-button');
        return button;
    }

    // was back and forth when trying to put this in but i think its good to show users they can do this
    function createOperatorComboBox() {
        const operators = ['=', '!=', '<', '>','<=' ,'>=' ]; const select=document.createElement('select' ); operators.forEach((op)=> {
            const option = document.createElement('option');
            option.value = op;
            option.textContent = op;
            select.appendChild(option);
        });
        return select.outerHTML;
    }

    // option for placeholder text based on condition being built
    function createTextBox(placeholder) {
        const textbox = document.createElement('input');
        textbox.type = 'text';
        textbox.placeholder = placeholder;
        return textbox.outerHTML;
    }

    /* ============= condititions ============ */

    function ifStatment() {
        const builderDiv = document.getElementById('condition-output');
        builderDiv.innerHTML = '';
        const template = `
    <div class="xsl-template" data-template="If Statement">
      &lt;xsl:if test="xyzzBUTTONxyzz xyzzCOMBOBOXXyzz xyzzTEXTBOXXyzz"&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&lt;!-- Put your HTML code here for what happens if the condition is true --&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&lt;!-- You can also test if a node exists without comparison --&gt;<br>
      &lt;/xsl:if&gt;
    </div>
  `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;

            // Replace placeholders with elements
            const button = createNodeButton('choose-node-btn');
            wrapper.innerHTML = wrapper.innerHTML.replace(
                'xyzzBUTTONxyzz',
                button.outerHTML,
            );

            const comboBoxHTML = createOperatorComboBox();
            wrapper.innerHTML = wrapper.innerHTML.replace(
                'xyzzCOMBOBOXXyzz',
                comboBoxHTML,
            );

            const textBoxHTML = createTextBox('Enter value');
            wrapper.innerHTML = wrapper.innerHTML.replace('xyzzTEXTBOXXyzz', textBoxHTML);

            builderDiv.append(wrapper);
        }

    function chooseWhenOtherwiseStatement() {
        const builderDiv = document.getElementById('condition-output');
        builderDiv.innerHTML = '';

        const template = `
    <div class="xsl-template" data-template="Choose/When/Otherwise">
      &lt;xsl:choose&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&lt;xsl:when test="xyzzBUTTONxyzz"&gt;Much like the if statement, you can do a condition like user/user_group = 'student'<br>In this case we're just checking if the node exists.&lt;/xsl:when&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&lt;!--You can do multiple <xsl:when...> tags if testing different values--&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&lt;xsl:otherwise&gt;Otherwise, do this instead&lt;/xsl:otherwise&gt;<br>
      &lt;/xsl:choose&gt;
    </div>
  `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;

            const button = createNodeButton('choose-node-btn');
            wrapper.innerHTML = wrapper.innerHTML.replace('xyzzBUTTONxyzz', button.outerHTML);

            builderDiv.append(wrapper);
        }

    function forEachStatement() {
        const builderDiv = document.getElementById('condition-output');
        builderDiv.innerHTML = '';

        const template = `
    <div class="xsl-template" data-template="For-Each">
      &lt;xsl:for-each select="xyzzBUTTONxyzz"&gt;<br>
      &nbsp;&nbsp;&nbsp;&nbsp;Do the same thing for each instance of the node chosen. Like for multiple books add "This is a book" for each one<br>
      &lt;/xsl:for-each&gt;
    </div>
  `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;

            const button = createNodeButton('choose-node-btn');
            wrapper.innerHTML = wrapper.innerHTML.replace('xyzzBUTTONxyzz', button.outerHTML);

            builderDiv.append(wrapper);
        }

    function valueOfStatement() {
        const builderDiv = document.getElementById('condition-output');
        builderDiv.innerHTML = '';

        const template = `
    <div class="xsl-template" data-template="Value-Of">
      &lt;xsl:value-of select="xyzzBUTTONxyzz"/&gt;
    </div>
  `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;

            const button = createNodeButton('choose-node-btn');
            wrapper.innerHTML = wrapper.innerHTML.replace('xyzzBUTTONxyzz', button.outerHTML);

            builderDiv.append(wrapper);
        }

    function sortStatement() {
        const builderDiv = document.getElementById('condition-output');
        builderDiv.innerHTML = '';

        const template = `
    <div class="xsl-template" data-template="Sort">
      &lt;xsl:sort select="xyzzBUTTONxyzz" order="ascending"/&gt;
    </div>
  `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = template;

            const button = createNodeButton('sort-node-btn');
            wrapper.innerHTML = wrapper.innerHTML.replace('xyzzBUTTONxyzz', button.outerHTML);

            builderDiv.append(wrapper);
        }

    document.addEventListener('click', function (event) {
        if (event.target && event.target.classList.contains('node-button')) {
            // Call the getSelectedNodeInfo function and pass the clicked button
            getSelectedNodeInfo(event.target, '#builder-right-pane');
        }
    });

    loadFancyTree(() => {
        createConditionBuilder();
        attachHelpEvents();
        addTreeControlButtons();
    });


    /* ===================== condition builder css =============================== */

    function injectConditionBuilderCSS() {
        const style = document.createElement('style');
        style.textContent = `
#condition-builder {
    position: fixed;
    top: 20%;
    left: 25%;
    width: 55%;
    height: 70%;
    background-color: #1e1e1e;
    color: white;
    /*border: 1px solid #333;*/
    border-radius: 8px;
    display: none;
    z-index: 1000;
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.2);
    padding: 20px 25px 20px 25px;
    max-height: 500px;
}
#condition-builder button {
       appearance: none;
       backface-visibility: hidden;
       background-color: #2f80ed;
       border-radius: 10px;
       border-style: none;
       box-shadow: none;
       box-sizing: border-box;
       color: #fff;
       cursor: pointer;
       display: inline-block;
       font-family: Inter,-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif;
       font-size: 15px;
       font-weight: 500;
       height: 50px;
       letter-spacing: normal;
       line-height: 1.5;
       outline: none;
       overflow: hidden;
       padding: 14px 30px;
       position: relative;
       text-align: center;
       text-decoration: none;
       transform: translate3d(0, 0, 0);
       transition: all .3s;
       user-select: none;
       -webkit-user-select: none;
       touch-action: manipulation;
       vertical-align: top;
       white-space: nowrap;
       margin:5px;
}

#condition-builder button:hover {
  background-color: #1366d6;
  box-shadow: rgba(0, 0, 0, .05) 0 5px 30px, rgba(0, 0, 0, .05) 0 1px 4px;
  opacity: 1;
  transform: translateY(0);
  transition-duration: .35s;
}

#condition-builder button:hover:after {
  opacity: .5;
}

#condition-builder button:active {
  box-shadow: rgba(0, 0, 0, .1) 0 3px 6px 0, rgba(0, 0, 0, .1) 0 0 10px 0, rgba(0, 0, 0, .1) 0 1px 4px -1px;
  transform: translateY(2px);
  transition-duration: .35s;
}

#condition-builder button:active:after {
  opacity: 1;
}

#condition-builder-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5); /* semi-transparent black */
    z-index: 999;
    display: none;
}
#condition-builder h1 {
  color:white;
}

#condition-builder label {
  color:white;
  margin-left: 5px;
}
#tree-controls button {
  padding: 5px;
  margin-right: 10px;
}
#condition-output {
  height: 70%;
  margin-bottom:10px;
  overflow: auto;
  background-color:grey;
}
#condition-builder table {
    width: 100%;
    height: 90%;
    border-spacing: 10px;
}
#condition-builder td {
  border-radius: 10px;
  padding:20px;
}
#conditions-pane {
    background-color: #2e2e2e;
    padding: 10px;
    width:200px;
    vertical-align: top;
}
#middle-pane {
    background-color: #3e3e3e;
    padding: 10px;
    vertical-align: top;
    width: auto;
    flex-grow: 1;
    text-align:center;
    width: 55%;
}
#builder-right-wrapper {
    background-color: #2e2e2e;
    padding: 10px;
    vertical-align: top;
    max-width: 100px;
}
#builder-right-pane {
    height: 85%;
    max-width:630px;
    overflow-y: auto;
    overflow-x: auto;
}
#conditions-pane .value {
    background-color: transparent;
    border: none;
    padding: 10px;
    color: white;
    display: flex;
    gap: 5px;
    cursor: pointer;
    border-radius: 4px;
}
#conditions-pane .value:hover,
#conditions-pane .value:focus {
    background-color: #21262C;
}
#conditions-pane .value:active {
    background-color: #1A1F24;
}
.fancytree-title {
    color: white;
}
.fancytree-checkbox {
    margin-right: 5px;
}
.fancytree-node {
    cursor: pointer;
    position: relative;
}
.fancytree-container {
    height: 100%;
    overflow: auto;
    line-height: 1.5;
}
.fancytree-leaf-node .fancytree-title {
    font-weight: bold;
}
.fancytree-connector {
    border-left: 50px solid #888;
    position: relative;
}
.fancytree-expander {
    margin-right: 1px;
}
#helpText {
  background-color: #2e2e2e;
  text-align:center;
  padding: 10px;
  font-size: large;
}
#helpText a {
  color: green;
}
.hidden-node {
    display: none !important;
}
.xsl-template {
  margin: 10px 0;
  padding: 5px;
  border-radius: 5px;
  font-family: monospace;
  text-align:justify;
}
.xsl-template button, .xsl-template select, .xsl-template input {
  margin: 2px;
}
  `;
        document.head.appendChild(style);
    }

    /* =================== UI Comps ==============================*/

    function addNavMenu() {
        const letterContainer = document.getElementsByTagName('letters-editor')[0];
        const navBarWrapper = document.createElement('div');
        navBarWrapper.id = 'nav-bar-wrapper';
        const navBarDiv = document.createElement('div');
        navBarDiv.id = 'nav-bar-container';
        navBarDiv.innerHTML = '<table id="navBarTable" style="text-align:center">
																	<tr id="navBarRow"/>
																</table>';
        navBarWrapper.append(navBarDiv);
        letterContainer.firstChild.before(navBarWrapper);
        // putting the add buttons here ensures they are added when the nav bar exists
        addButtons();
        const style = document.createElement('style');
        style.textContent = `
  #nav-bar-wrapper {
    width: 30%;
    margin: 20px auto;
    background-color: #2b2b2b;
    padding: 10px;
    border-radius: 10px;
    display: flex;
    justify-content: center;
  }

  #nav-bar-container {
    display: flex;
    gap: 10px;
  }

  #navBarRow button {
    background-color: #4a90e2;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 14px;
    margin-left:10px;
  }


  .nav-button:hover {
    background-color: #555;
  }
`;
        document.head.appendChild(style);
    };

    function addButtons() {
        addDetachButton();
        addConBuilderBtn();
    }

    function addToNavMenu(element) {
        const row = document.getElementById('navBarRow');
        if (row) {
            const cell = row.insertCell(-1);
            cell.appendChild(element);
        } else {
            console.error('Navigation bar row not found.');
        }
    }

    const updatePreviewButton = () => {
        if (document.getElementById('monaco-upreview-button')) return;

        const btn = document.createElement('button');
        btn.id = 'monaco-upreview-button';
        btn.textContent = 'Update Preview';
        btn.onclick = applyTextToAce;

        addToNavMenu(btn);
    };

    // Add the toggle button to the page
    function addDetachButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Detach Preview';
        btn.id = 'detach-preview-button';
        btn.onclick = toggleDetachPreview;
        addToNavMenu(btn);
    }

    function addConBuilderBtn() {
        const btn = document.createElement('button');
        btn.textContent = 'Condition Builder';
        btn.id = 'condition-builder-btn';
        btn.onclick = toggleConditionBuilder;
        addToNavMenu(btn);
    }

    /* ========================== Inject Start ====================================*/

    waitForAceEditor();
    injectConditionBuilderCSS();

    Object.assign(window, {
        ifStatment,
        chooseWhenOtherwiseStatement,
        forEachStatement,
        valueOfStatement,
        sortStatement
    });

})();