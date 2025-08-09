import { Box, Flex, HStack, Icon, Text, useToast } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { editor } from "monaco-editor/esm/vs/editor/editor.api";
import { useEffect, useRef, useState } from "react";
import { VscChevronRight, VscFolderOpened, VscGist } from "react-icons/vsc";
import { useParams } from "react-router-dom";
import useSWR from "swr";
import useLocalStorageState from "use-local-storage-state";

import Footer from "./Footer";
import Sidebar from "./Sidebar";
import animals from "./animals.json";
import languages from "./languages.json";
import YjsPad, { UserInfo } from "./yjspad";

function getWsUri(id: string) {
  let url = new URL(`api/socket/${id}`, window.location.href);
  return url.href;
}

function generateName() {
  return "Anonymous " + animals[Math.floor(Math.random() * animals.length)];
}

function generateHue() {
  return Math.floor(Math.random() * 360);
}

// SWR fetcher for API calls
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("Failed to fetch");
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
};

function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [language, setLanguage] = useState("plaintext");
  const [connection, setConnection] = useState<
    "connected" | "disconnected" | "desynchronized"
  >("disconnected");
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [name, setName] = useLocalStorageState("name", {
    defaultValue: generateName,
  });
  const [hue, setHue] = useLocalStorageState("hue", {
    defaultValue: generateHue,
  });
  const [editor, setEditor] = useState<editor.IStandaloneCodeEditor>();
  const [colorMode, setColorMode] = useLocalStorageState<
    "light" | "dark" | "system"
  >("colorMode", {
    defaultValue: "system",
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const yjspad = useRef<YjsPad>();

  // Calculate actual dark mode based on colorMode and system preference
  const darkMode =
    colorMode === "system" ? systemPrefersDark : colorMode === "dark";

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Listen to system color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Set initial value
    setSystemPrefersDark(mediaQuery.matches);

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Use SWR to check if document exists
  const {
    data: documentData,
    error: documentError,
    isLoading: isCheckingDocument,
  } = useSWR(
    id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
      ? `/api/file/${id}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );

  // Determine document existence based on SWR result
  const documentExists = documentError?.status === 404 ? false : !!documentData;

  // Create YjsPad with initial content handling
  useEffect(() => {
    if (!editor || !id || documentExists !== true) return;

    if (yjspad.current) {
      return;
    }

    const pad = new YjsPad({
      uri: getWsUri(id),
      editor,
      onConnected: () => setConnection("connected"),
      onDisconnected: () => setConnection("disconnected"),
      onDesynchronized: () => {
        setConnection("desynchronized");
        toast({
          title: "Desynchronized with server",
          description: "Please save your work and refresh the page.",
          status: "error",
          position: "bottom-right",
          duration: null,
        });
      },
      onChangeLanguage: (language: string) => {
        if (languages.includes(language)) {
          setLanguage(language);
        }
      },
      onChangeUsers: setUsers,
      onInitialContentNeeded: async () => {
        // Use documentData from SWR if available, otherwise fetch
        if (documentData) {
          if (
            documentData.language &&
            languages.includes(documentData.language)
          ) {
            setLanguage(documentData.language);
          }
          return documentData.content || "";
        }

        // Fallback to direct fetch if SWR data not available
        try {
          const response = await fetch(`/api/file/${id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.language && languages.includes(data.language)) {
              setLanguage(data.language);
            }
            return data.content || "";
          } else {
            console.log("API响应失败，可能是新文档");
          }
        } catch (error) {
          console.error("获取文件内容失败:", error);
        }
        return "";
      },
    });

    yjspad.current = pad;

    return () => {
      pad.dispose();
      yjspad.current = undefined;
    };
  }, [id, editor, toast, documentExists, documentData]);

  useEffect(() => {
    if (connection === "connected") {
      yjspad.current?.setInfo({ name, hue });
    }
  }, [connection, name, hue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        saveFileToBackend();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, id, language]);

  function handleLanguageChange(language: string) {
    setLanguage(language);
    if (yjspad.current?.setLanguage(language)) {
      toast({
        title: "Language updated",
        position: "bottom-right",
        description: (
          <>
            All users are now editing in{" "}
            <Text as="span" fontWeight="semibold">
              {language}
            </Text>
            .
          </>
        ),
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    }
  }

  function handleDarkModeChange() {
    // Cycle through: system -> light -> dark -> system
    if (colorMode === "system") {
      setColorMode("light");
    } else if (colorMode === "light") {
      setColorMode("dark");
    } else {
      setColorMode("system");
    }
  }

  const saveFileToBackend = async () => {
    if (!editor?.getModel() || !id) return;

    setIsSaving(true);
    try {
      const content = editor.getModel()!.getValue();
      const response = await fetch(`/api/file/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          language,
        }),
      });

      if (response.ok) {
        setLastSaved(new Date());
        toast({
          title: "文件已保存",
          description: "文件已成功保存到服务器",
          position: "bottom-right",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      } else {
        throw new Error("保存失败");
      }
    } catch (error) {
      console.error("保存文件失败:", error);
      toast({
        title: "保存失败",
        position: "bottom-right",
        description: "无法保存文件到服务器",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle validation and early returns after all hooks
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  ) {
    return (
      <Box p={8} textAlign="center">
        <Text fontSize="xl" color="red.500">
          Invalid document ID: {id}
        </Text>
      </Box>
    );
  }

  // Show loading or error state while checking document existence
  if (isCheckingDocument) {
    return (
      <Box p={8} textAlign="center">
        <Text fontSize="xl">检查文档中...</Text>
      </Box>
    );
  }

  if (documentExists === false) {
    return (
      <Box p={8} textAlign="center">
        <Text fontSize="xl" color="red.500">
          文档不存在: {id}
        </Text>
        <Text mt={2} color="gray.500">
          请检查文档ID是否正确
        </Text>
      </Box>
    );
  }

  return (
    <Flex
      direction="column"
      h="100vh"
      overflow="hidden"
      bgColor={darkMode ? "#1e1e1e" : "white"}
      color={darkMode ? "#cbcaca" : "inherit"}
    >
      <Box
        flexShrink={0}
        bgColor={darkMode ? "#333333" : "#e8e8e8"}
        color={darkMode ? "#cccccc" : "#383838"}
        textAlign="center"
        fontSize="sm"
        py={0.5}
      >
        Remdit
      </Box>
      <Flex flex="1 0" minH={0}>
        <Sidebar
          documentId={id}
          connection={connection}
          darkMode={darkMode}
          colorMode={colorMode}
          systemPrefersDark={systemPrefersDark}
          language={language}
          currentUser={{ name, hue }}
          users={users}
          onDarkModeChange={handleDarkModeChange}
          onLanguageChange={handleLanguageChange}
          onChangeName={(name) => name.length > 0 && setName(name)}
          onChangeColor={() => setHue(generateHue())}
          onSave={saveFileToBackend}
          isSaving={isSaving}
          lastSaved={lastSaved}
        />

        <Flex flex={1} minW={0} h="100%" direction="column" overflow="hidden">
          <HStack
            h={6}
            spacing={1}
            color="#888888"
            fontWeight="medium"
            fontSize="14px"
            px={3.5}
            flexShrink={0}
          >
            <Icon as={VscFolderOpened} fontSize="md" color="blue.500" />
            <Text>documents</Text>
            <Icon as={VscChevronRight} fontSize="md" />
            <Icon as={VscGist} fontSize="md" color="purple.500" />
            <Text>{id}</Text>
          </HStack>
          <Box flex={1} minH={0}>
            <Editor
              theme={darkMode ? "vs-dark" : "vs"}
              language={language}
              options={{
                automaticLayout: true,
                fontSize: 16,
              }}
              onMount={(editor) => setEditor(editor)}
            />
          </Box>
        </Flex>
      </Flex>
      <Footer />
    </Flex>
  );
}

export default EditorPage;
