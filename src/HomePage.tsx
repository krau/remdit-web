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
            A collaborative text editor in browser, for your remote files.
          </Text>
        </Box>

        <VStack spacing={4}>
          <Button
            colorScheme="blue"
            size="lg"
            onClick={() => {
              window.open("https://github.com/krau/remdit", "_blank");
            }}
          >
            Get Started
          </Button>
        </VStack>
      </VStack>
    </Container>
  );
}

export default HomePage;
