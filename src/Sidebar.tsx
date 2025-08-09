import {
  Button,
  Container,
  Flex,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Select,
  Stack,
  Switch,
  Text,
  useToast,
} from "@chakra-ui/react";

import ConnectionStatus from "./ConnectionStatus";
import User from "./User";
import languages from "./languages.json";
import type { UserInfo } from "./yjspad";

export type SidebarProps = {
  documentId: string;
  connection: "connected" | "disconnected" | "desynchronized";
  darkMode: boolean;
  colorMode: "light" | "dark" | "system";
  systemPrefersDark: boolean;
  language: string;
  currentUser: UserInfo;
  users: Record<number, UserInfo>;
  onDarkModeChange: () => void;
  onLanguageChange: (language: string) => void;
  onChangeName: (name: string) => void;
  onChangeColor: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  lastSaved?: Date | null;
};

function Sidebar({
  documentId,
  connection,
  darkMode,
  colorMode,
  systemPrefersDark,
  language,
  currentUser,
  users,
  onDarkModeChange,
  onLanguageChange,
  onChangeName,
  onChangeColor,
  onSave,
  isSaving,
  lastSaved,
}: SidebarProps) {
  const toast = useToast();

  // For sharing the document by link to others.
  const documentUrl = `${window.location.origin}/edit/${documentId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(documentUrl);
    toast({
      title: "Copied!",
      position: "top-left",
      description: "Link copied to clipboard",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
  }

  return (
    <Container
      w={{ base: "3xs", md: "2xs", lg: "xs" }}
      display={{ base: "none", sm: "block" }}
      bgColor={darkMode ? "#252526" : "#f3f3f3"}
      overflowY="auto"
      maxW="full"
      lineHeight={1.4}
      py={4}
    >
      <ConnectionStatus darkMode={darkMode} connection={connection} />

      <Flex justifyContent="space-between" mt={4} mb={1.5} w="full">
        <Heading size="sm">
          Color Mode
          <Text fontSize="xs" color="gray.500" fontWeight="normal">
            {colorMode === "system"
              ? `System (${systemPrefersDark ? "Dark" : "Light"})`
              : colorMode === "dark"
                ? "Dark"
                : "Light"}
          </Text>
        </Heading>
        <Button
          size="xs"
          variant="outline"
          onClick={onDarkModeChange}
          _hover={{ bg: darkMode ? "#575759" : "gray.200" }}
          bgColor={darkMode ? "#575759" : "gray.200"}
          color={darkMode ? "white" : "inherit"}
        >
          {colorMode === "system" ? "🖥️" : colorMode === "dark" ? "🌙" : "☀️"}
        </Button>
      </Flex>

      <Heading mt={4} mb={1.5} size="sm">
        Language
      </Heading>
      <Select
        size="sm"
        bgColor={darkMode ? "#3c3c3c" : "white"}
        borderColor={darkMode ? "#3c3c3c" : "white"}
        value={language}
        onChange={(event) => onLanguageChange(event.target.value)}
      >
        {languages.map((lang) => (
          <option key={lang} value={lang} style={{ color: "black" }}>
            {lang}
          </option>
        ))}
      </Select>

      {onSave && (
        <>
          <Heading mt={4} mb={1.5} size="sm">
            File Actions
          </Heading>
          <Button
            size="sm"
            colorScheme="blue"
            variant="outline"
            onClick={onSave}
            isLoading={isSaving}
            loadingText="保存中..."
            w="full"
            mb={2}
          >
            保存文件 (Ctrl+S)
          </Button>
          {lastSaved && (
            <Text fontSize="xs" color="gray.500" mb={2}>
              上次保存: {lastSaved.toLocaleTimeString()}
            </Text>
          )}
        </>
      )}

      <Heading mt={4} mb={1.5} size="sm">
        Share Link
      </Heading>
      <InputGroup size="sm">
        <Input
          readOnly
          pr="3.5rem"
          variant="outline"
          bgColor={darkMode ? "#3c3c3c" : "white"}
          borderColor={darkMode ? "#3c3c3c" : "white"}
          value={documentUrl}
        />
        <InputRightElement width="3.5rem">
          <Button
            h="1.4rem"
            size="xs"
            onClick={handleCopy}
            _hover={{ bg: darkMode ? "#575759" : "gray.200" }}
            bgColor={darkMode ? "#575759" : "gray.200"}
            color={darkMode ? "white" : "inherit"}
          >
            Copy
          </Button>
        </InputRightElement>
      </InputGroup>

      <Heading mt={4} mb={1.5} size="sm">
        Active Users
      </Heading>
      <Stack spacing={0} mb={1.5} fontSize="sm">
        <User
          info={currentUser}
          isMe
          onChangeName={onChangeName}
          onChangeColor={onChangeColor}
          darkMode={darkMode}
        />
        {Object.entries(users).map(([id, info]) => (
          <User key={id} info={info} darkMode={darkMode} />
        ))}
      </Stack>

      <Heading mt={4} mb={1.5} size="sm">
        About
      </Heading>
      <Text fontSize="sm" mb={1.5}>
        <strong>Remdit</strong> 是一个浏览器中的远程文本文件协作编辑器.
      </Text>
      <Text fontSize="sm" mb={1.5}>
        将此编辑器的链接分享给其他人，他们可以在浏览器中实时编辑，同时看到您的更改。
      </Text>
      <Text fontSize="sm" mb={1.5}>
        Built using Golang and TypeScript. See the{" "}
        <Link
          color="blue.600"
          fontWeight="semibold"
          href="https://github.com/krau/remdit"
          isExternal
        >
          GitHub repository
        </Link>{" "}
        for details.
      </Text>
    </Container>
  );
}

export default Sidebar;
