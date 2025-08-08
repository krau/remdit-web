import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react";

function HomePage() {
  return (
    <Container maxW="md" centerContent>
      <VStack spacing={8} py={20}>
        <Box textAlign="center">
          <Heading as="h1" size="2xl" mb={4}>
            Remdit
          </Heading>
          <Text fontSize="lg" color="gray.600">
            A collaborative code editor in your browser
          </Text>
        </Box>

        <VStack spacing={4}>
          <Button
            colorScheme="blue"
            size="lg"
            onClick={() => {
              window.open("https://github.com", "_blank");
            }}
          >
            Get Started
          </Button>

          <Text fontSize="sm" color="gray.500" textAlign="center">
            Share a link to this pad with others, and they can edit from their
            browser while seeing your changes in real time.
          </Text>
        </VStack>
      </VStack>
    </Container>
  );
}

export default HomePage;
