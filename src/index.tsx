import { registry } from "@jahia/ui-extender";
import { Plugin, type ViewDocumentClipboardInputEvent, type EditorConfig } from "ckeditor5";
import { process } from "./clean.ts";
import { createRoot } from "react-dom/client";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Typography } from "@jahia/moonstone";
import { useEffect, useState } from "react";

function App() {
  const [isOpen, setIsOpen] = useState(true);

  class HappyPaste extends Plugin {
    init() {
      this.listenTo<ViewDocumentClipboardInputEvent>(
        this.editor.editing.view.document,
        "clipboardInput",
        (evt, data) => {
          const dataTransfer = data.dataTransfer;
          const html = dataTransfer.getData("text/html");
          const text = dataTransfer.getData("text/plain");
          if (!html) return;

          // @ts-expect-error The original one is read-only
          data.dataTransfer = new DataTransfer();
          const processed = process(html);
          if (processed.files.length > 0) {
            evt.stop();
            setIsOpen(true);
          }
          data.dataTransfer.setData("text/html", processed.html);
          data.dataTransfer.setData("text/plain", text);
        },
      );
    }
  }

  useEffect(() => {
    for (const config of registry.find({ type: "ckeditor5-config" })) {
      (config as EditorConfig)?.plugins?.push(HappyPaste);
    }
  });

  const Picker = (registry.get("externalPickerConfiguration", "default") as any).pickerDialog.cmp;

  return (
    <Modal isOpen={isOpen} style={{ zIndex: 1300 }}>
      <>
        <ModalHeader title="Modal Title" />
        <ModalBody>
          <Typography>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce sed elit et nibh rhoncus
            tincidunt id vel orci. Quisque vehicula eleifend odio, vitae dapibus eros volutpat vel.
          </Typography>
          <Picker
            field={{
              __typename: "GqlEditorFormField",
              name: "jnt:contentFolderReference_j:node",
              displayName: "select the path of the content folder to display",
              description: "",
              errorMessage: "",
              visible: true,
              mandatory: false,
              i18n: false,
              multiple: false,
              readOnly: false,
              requiredType: "WEAKREFERENCE",
              selectorType: "Picker",
              selectorOptions: [
                {
                  __typename: "GqlEditorFormProperty",
                  name: "type",
                  value: "contentfolder",
                  values: null,
                },
              ],
              valueConstraints: [
                {
                  __typename: "GqlEditorFormValueConstraint",
                  value: {
                    __typename: "GqlEditorFormValue",
                    type: "String",
                    string: "jnt:contentFolder",
                  },
                  displayValue: "jnt:contentFolder",
                  displayValueKey: null,
                  properties: [],
                },
              ],
              defaultValues: [],
              nodeType: "jnt:contentFolderReference",
              propertyName: "j:node",
            }}
            form={{
              values: {
                "jmix:i18n_j:invalidLanguages": [],
                "WIP::Info": {
                  status: "DISABLED",
                  languages: [],
                },
                "nt:base_ce:systemName": "display-a-content-folder",
              },
              errors: {},
              touched: {},
              isSubmitting: false,
              isValidating: false,
              submitCount: 0,
              initialValues: {
                "jmix:i18n_j:invalidLanguages": [],
                "WIP::Info": {
                  status: "DISABLED",
                  languages: [],
                },
                "nt:base_ce:systemName": "display-a-content-folder",
              },
              initialErrors: {},
              initialTouched: {},
              handleBlur: () => {},
              handleChange: () => {},
              handleReset: () => {},
              handleSubmit: () => {},
              resetForm: () => {},
              setErrors: () => {},
              setFormikState: () => {},
              setFieldTouched: () => {},
              setFieldValue: () => {},
              setFieldError: () => {},
              setStatus: () => {},
              setSubmitting: () => {},
              setTouched: () => {},
              setValues: () => {},
              submitForm: () => {},
              validateForm: () => {},
              validateField: () => {},
              isValid: true,
              dirty: false,
              unregisterField: () => {},
              registerField: () => {},
              getFieldProps: () => {},
              getFieldMeta: () => {},
              getFieldHelpers: () => {},
              validateOnBlur: false,
              validateOnChange: false,
              validateOnMount: false,
            }}
            id="jnt:contentFolderReference_j:node"
            editorContext={{
              path: "/sites/luxe/home/main",
              currentPage: {
                path: "/sites/luxe/home",
                template: "default",
                templateType: ".html",
                config: "page",
              },
              lang: "en",
              browserLang: "en-US",
              site: "luxe",
              mode: "create",
              siteInfo: {
                __typename: "JCRSite",
                displayName: "Demo Site Luxe",
                defaultLanguage: "en",
                serverName: "localhost",
                description: "Simple demo website built by the Jahia team",
                languages: [
                  {
                    __typename: "JCRSiteLanguage",
                    displayName: "English",
                    localizedDisplayName: "English",
                    uiLanguageDisplayName: "English",
                    language: "en",
                    activeInEdit: true,
                  },
                  {
                    __typename: "JCRSiteLanguage",
                    displayName: "français",
                    localizedDisplayName: "French",
                    uiLanguageDisplayName: "French",
                    language: "fr",
                    activeInEdit: true,
                  },
                ],
                uuid: "711f6985-375b-4a3c-8f70-2b3e62a8fbee",
                workspace: "LIVE",
                path: "/sites/luxe",
              },
              nodeData: {
                __typename: "GenericJCRNode",
                newName: "display-a-content-folder",
                site: {
                  __typename: "JCRSite",
                  name: "luxe",
                  uuid: "711f6985-375b-4a3c-8f70-2b3e62a8fbee",
                  workspace: "EDIT",
                  path: "/sites/luxe",
                },
                lockedAndCannotBeEdited: false,
                displayableNode: {
                  __typename: "GenericJCRNode",
                  path: "/sites/luxe/home",
                  isFolder: false,
                  uuid: "7c82dab5-cf86-4d6e-b1bc-a7b13d643ded",
                  workspace: "EDIT",
                },
                displayName: "Main Content Area",
                mixinTypes: [
                  {
                    __typename: "JCRNodeType",
                    name: "jmix:isAreaList",
                  },
                ],
                parent: {
                  __typename: "GenericJCRNode",
                  displayName: "Home",
                  path: "/sites/luxe/home",
                  uuid: "7c82dab5-cf86-4d6e-b1bc-a7b13d643ded",
                  workspace: "EDIT",
                },
                primaryNodeType: {
                  __typename: "JCRNodeType",
                  name: "jnt:contentList",
                  displayName: "List of content items",
                  properties: [
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:primaryType",
                      requiredType: "NAME",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:mixinTypes",
                      requiredType: "NAME",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:nodename",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:fullpath",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:uuid",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:created",
                      requiredType: "DATE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:createdBy",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:locktoken",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:lockTypes",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:lockOwner",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:lockIsDeep",
                      requiredType: "BOOLEAN",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:lastModified",
                      requiredType: "DATE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:lastModifiedBy",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:published",
                      requiredType: "BOOLEAN",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:lastPublished",
                      requiredType: "DATE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:lastPublishedBy",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:workInProgress",
                      requiredType: "BOOLEAN",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:workInProgressStatus",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:workInProgressLanguages",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:invalidLanguages",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:originWS",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:description",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:processId",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:legacyRuleSettings",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:versionHistory",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:baseVersion",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:predecessors",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:mergeFailed",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:activity",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:configuration",
                      requiredType: "REFERENCE",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:isCheckedOut",
                      requiredType: "BOOLEAN",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "jcr:title",
                      requiredType: "STRING",
                    },
                    {
                      __typename: "JCRPropertyDefinition",
                      name: "j:subNodesView",
                      requiredType: "STRING",
                    },
                  ],
                  supertypes: [
                    {
                      __typename: "JCRNodeType",
                      name: "jnt:content",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "nt:base",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:nodenameInfo",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:referenceable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:observable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:basemetadata",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:unversionedBasemetadata",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:created",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:lockable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:lockable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:lastModified",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:lastPublished",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:i18n",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:originWS",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:description",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:workflow",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:conditionalVisibility",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:versionable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:simpleVersionable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:searchable",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:listContent",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:droppableContent",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:accessControllableContent",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "mix:title",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:list",
                    },
                    {
                      __typename: "JCRNodeType",
                      name: "jmix:renderableList",
                    },
                  ],
                  hasOrderableChildNodes: true,
                },
                defaultWipInfo: {
                  __typename: "wipInfo",
                  status: "DISABLED",
                  languages: [],
                },
                uuid: "6915595b-3788-43f0-b7ce-242360f0f177",
                workspace: "EDIT",
                path: "/sites/luxe/home/main",
              },
              details: {},
              technicalInfo: [],
              initialValues: {
                "jmix:i18n_j:invalidLanguages": [],
                "WIP::Info": {
                  status: "DISABLED",
                  languages: [],
                },
                "nt:base_ce:systemName": "display-a-content-folder",
              },
              expandedSections: {
                content: true,
                metadata: false,
                layout: false,
                options: false,
                visibility: false,
              },
              hasPreview: false,
              showAdvancedMode: true,
              title: "Create Display a content folder",
              nodeTypeName: "jnt:contentFolderReference",
              nodeTypeDisplayName: "Display a content folder",
              refetchFormData: () => {},
              errors: null,
              setErrors: () => {},
              i18nContext: { memo: { count: 1 } },
              setI18nContext: () => {},
              resetI18nContext: () => {},
              createAnother: { set: () => {}, value: false },
            }}
            inputContext={{
              displayLabels: true,
              displayBadges: true,
              displayActions: true,
              displayErrors: true,
              selectorType: {
                supportMultiple: true,
                key: "Picker",
                pickerConfig: {
                  pickerInput: {
                    emptyLabel:
                      "jcontent:label.contentEditor.edit.fields.contentPicker.modalFolderTitle",
                  },
                  pickerDialog: {
                    dialogTitle:
                      "jcontent:label.contentEditor.edit.fields.contentPicker.modalFolderTitle",
                    displayTree: false,
                  },
                  searchContentType: "jnt:contentFolder",
                  selectableTypesTable: ["jnt:contentFolder"],
                  targets: [],
                  type: "pickerConfiguration",
                  key: "contentfolder",
                },
              },
              actionContext: {
                editorContext: {
                  path: "/sites/luxe/home/main",
                  currentPage: {
                    path: "/sites/luxe/home",
                    template: "default",
                    templateType: ".html",
                    config: "page",
                  },
                  lang: "en",
                  browserLang: "en-US",
                  site: "luxe",
                  mode: "create",
                  siteInfo: {
                    __typename: "JCRSite",
                    displayName: "Demo Site Luxe",
                    defaultLanguage: "en",
                    serverName: "localhost",
                    description: "Simple demo website built by the Jahia team",
                    languages: [
                      {
                        __typename: "JCRSiteLanguage",
                        displayName: "English",
                        localizedDisplayName: "English",
                        uiLanguageDisplayName: "English",
                        language: "en",
                        activeInEdit: true,
                      },
                      {
                        __typename: "JCRSiteLanguage",
                        displayName: "français",
                        localizedDisplayName: "French",
                        uiLanguageDisplayName: "French",
                        language: "fr",
                        activeInEdit: true,
                      },
                    ],
                    uuid: "711f6985-375b-4a3c-8f70-2b3e62a8fbee",
                    workspace: "LIVE",
                    path: "/sites/luxe",
                  },
                  nodeData: {
                    __typename: "GenericJCRNode",
                    newName: "display-a-content-folder",
                    site: {
                      __typename: "JCRSite",
                      name: "luxe",
                      uuid: "711f6985-375b-4a3c-8f70-2b3e62a8fbee",
                      workspace: "EDIT",
                      path: "/sites/luxe",
                    },
                    lockedAndCannotBeEdited: false,
                    displayableNode: {
                      __typename: "GenericJCRNode",
                      path: "/sites/luxe/home",
                      isFolder: false,
                      uuid: "7c82dab5-cf86-4d6e-b1bc-a7b13d643ded",
                      workspace: "EDIT",
                    },
                    displayName: "Main Content Area",
                    mixinTypes: [
                      {
                        __typename: "JCRNodeType",
                        name: "jmix:isAreaList",
                      },
                    ],
                    parent: {
                      __typename: "GenericJCRNode",
                      displayName: "Home",
                      path: "/sites/luxe/home",
                      uuid: "7c82dab5-cf86-4d6e-b1bc-a7b13d643ded",
                      workspace: "EDIT",
                    },
                    primaryNodeType: {
                      __typename: "JCRNodeType",
                      name: "jnt:contentList",
                      displayName: "List of content items",
                      properties: [
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:primaryType",
                          requiredType: "NAME",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:mixinTypes",
                          requiredType: "NAME",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:nodename",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:fullpath",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:uuid",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:created",
                          requiredType: "DATE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:createdBy",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:locktoken",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:lockTypes",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:lockOwner",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:lockIsDeep",
                          requiredType: "BOOLEAN",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:lastModified",
                          requiredType: "DATE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:lastModifiedBy",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:published",
                          requiredType: "BOOLEAN",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:lastPublished",
                          requiredType: "DATE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:lastPublishedBy",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:workInProgress",
                          requiredType: "BOOLEAN",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:workInProgressStatus",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:workInProgressLanguages",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:invalidLanguages",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:originWS",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:description",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:processId",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:legacyRuleSettings",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:versionHistory",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:baseVersion",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:predecessors",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:mergeFailed",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:activity",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:configuration",
                          requiredType: "REFERENCE",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:isCheckedOut",
                          requiredType: "BOOLEAN",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "jcr:title",
                          requiredType: "STRING",
                        },
                        {
                          __typename: "JCRPropertyDefinition",
                          name: "j:subNodesView",
                          requiredType: "STRING",
                        },
                      ],
                      supertypes: [
                        {
                          __typename: "JCRNodeType",
                          name: "jnt:content",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "nt:base",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:nodenameInfo",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:referenceable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:observable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:basemetadata",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:unversionedBasemetadata",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:created",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:lockable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:lockable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:lastModified",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:lastPublished",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:i18n",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:originWS",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:description",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:workflow",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:conditionalVisibility",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:versionable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:simpleVersionable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:searchable",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:listContent",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:droppableContent",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:accessControllableContent",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "mix:title",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:list",
                        },
                        {
                          __typename: "JCRNodeType",
                          name: "jmix:renderableList",
                        },
                      ],
                      hasOrderableChildNodes: true,
                    },
                    defaultWipInfo: {
                      __typename: "wipInfo",
                      status: "DISABLED",
                      languages: [],
                    },
                    uuid: "6915595b-3788-43f0-b7ce-242360f0f177",
                    workspace: "EDIT",
                    path: "/sites/luxe/home/main",
                  },
                  details: {},
                  technicalInfo: [],
                  initialValues: {
                    "jmix:i18n_j:invalidLanguages": [],
                    "WIP::Info": {
                      status: "DISABLED",
                    },
                    "nt:base_ce:systemName": "display-a-content-folder",
                  },
                  expandedSections: {
                    content: true,
                    metadata: false,
                    layout: false,
                    options: false,
                    visibility: false,
                  },
                  hasPreview: false,
                  showAdvancedMode: true,
                  title: "Create Display a content folder",
                  nodeTypeName: "jnt:contentFolderReference",
                  nodeTypeDisplayName: "Display a content folder",
                  errors: null,
                  i18nContext: {
                    memo: {
                      count: 1,
                    },
                  },
                  createAnother: {
                    value: false,
                  },
                },
              },
            }}
            onChange={() => {}}
            onBlur={() => {}}
          />
        </ModalBody>
        <ModalFooter>
          <Typography>Modal footer</Typography>
          <Button
            label="Close"
            onClick={function () {
              setIsOpen(false);
            }}
          />
        </ModalFooter>
      </>
    </Modal>
  );
}

export default function init() {
  registry.add("callback", "happy-paste", {
    targets: ["jahiaApp-init:999"],
    callback() {
      const root = document.createElement("div");
      root.dataset.testid = "happy-paste-root";
      document.body.appendChild(root);
    },
  });

  registry.add("app", "happy-paste", {
    targets: ["root:17"],
    render: (next) => (
      <>
        <App />
        {next}
      </>
    ),
  });
}
