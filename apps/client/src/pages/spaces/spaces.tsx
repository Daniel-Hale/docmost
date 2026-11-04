import { Container, Title, Text, Group, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import CreateSpaceModal from "@/features/space/components/create-space-modal";
import { AllSpacesList } from "@/features/space/components/spaces-page";
import FavoriteSpacesGrid from "@/features/space/components/spaces-page/favorite-spaces-grid";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import useUserRole from "@/hooks/use-user-role";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function Spaces({ category = 'company' }: { category?: 'company' | 'vendor' }) {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const vendorMode = category === 'vendor';
  const heading = vendorMode ? 'Vendors' : 'Companys';
  const { search, cursor, goNext, goPrev, handleSearch } = usePaginateAndSearch();

  const { data, isLoading } = useGetSpacesQuery({
    cursor,
    limit: 30,
    query: search,
    category,
  });

  return (
    <>
      <DocumentTitle title={heading} />

      <Container size={"800"} pt="xl">
        <Group justify="space-between" mb="xl">
          <Title order={1} size="h3">{heading}</Title>
          {isAdmin && <CreateSpaceModal category={category} />}
        </Group>

        {!vendorMode && <FavoriteSpacesGrid category="company" />}

        <Box>
          <Text size="sm" c="dimmed" mb="md">
            {vendorMode ? 'Vendors you can access' : 'Companys you can access'}
          </Text>

          <AllSpacesList
            spaces={data?.items || []}
            onSearch={handleSearch}
            hasPrevPage={data?.meta?.hasPrevPage}
            hasNextPage={data?.meta?.hasNextPage}
            onNext={() => goNext(data?.meta?.nextCursor)}
            onPrev={goPrev}
          />
        </Box>
      </Container>
    </>
  );
}
