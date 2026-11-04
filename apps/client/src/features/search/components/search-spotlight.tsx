import { Spotlight } from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import { Group, VisuallyHidden, Text } from "@mantine/core";
import { useState, useMemo, useCallback } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { searchSpotlightStore } from "../constants.ts";
import { SearchSpotlightFilters } from "./search-spotlight-filters.tsx";
import {
  useUnifiedSearch,
  type UseUnifiedSearchParams,
} from "../hooks/use-unified-search.ts";
import { SearchResultItem } from "./search-result-item.tsx";

interface SearchSpotlightProps {
  spaceId?: string;
}

export function SearchSpotlight({ spaceId }: SearchSpotlightProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(query, 300);
  const [filters, setFilters] = useState<{
    spaceId?: string | null;
    contentType?: string;
    creatorId?: string | null;
    labelIds?: string[];
    titleOnly?: boolean;
  }>({ contentType: "page" });

  const searchParams = useMemo(() => {
    const params: UseUnifiedSearchParams = {
      query: debouncedSearchQuery,
      contentType: "page",
    };
    if (filters.spaceId) params.spaceId = filters.spaceId;
    if (filters.creatorId) params.creatorId = filters.creatorId;
    if (filters.labelIds?.length) params.labelIds = filters.labelIds;
    if (filters.titleOnly) params.titleOnly = true;
    return params;
  }, [debouncedSearchQuery, filters]);

  const { data: searchResults, isFetching } = useUnifiedSearch(searchParams);
  const resultItems = (searchResults || []).map((result) => (
    <SearchResultItem
      key={result.id}
      result={result}
      isAttachmentResult={false}
      showSpace={!filters.spaceId}
    />
  ));
  const handleFiltersChange = useCallback((newFilters: any) => {
    setFilters(newFilters);
  }, []);
  const isFilterBrowse =
    (filters.labelIds?.length ?? 0) > 0 || !!filters.creatorId;
  const isQuerySettled = query === debouncedSearchQuery;

  return (
    <Spotlight.Root
      size="xl"
      maxHeight={600}
      store={searchSpotlightStore}
      query={query}
      onQueryChange={setQuery}
      scrollable
      overlayProps={{ backgroundOpacity: 0.55 }}
    >
      <Group gap="xs" px="sm" pt="sm" pb="xs">
        <Spotlight.Search
          placeholder={t("Search...")}
          aria-label={t("Search")}
          leftSection={<IconSearch size={20} stroke={1.5} />}
          style={{ flex: 1 }}
        />
      </Group>

      <div style={{ padding: "4px 16px" }}>
        <SearchSpotlightFilters
          onFiltersChange={handleFiltersChange}
          spaceId={spaceId}
        />
      </div>

      <VisuallyHidden role="status" aria-live="polite">
        {(query.length > 0 || isFilterBrowse) && !isFetching
          ? resultItems.length === 0
            ? t("No results found")
            : t("{{count}} results found", { count: resultItems.length })
          : ""}
      </VisuallyHidden>

      <Spotlight.ActionsList>
        {query.length === 0 && !isFilterBrowse && resultItems.length === 0 && (
          <Spotlight.Empty>{t("Start typing to search...")}</Spotlight.Empty>
        )}
        {(query.length > 0 || isFilterBrowse) &&
          !isFetching &&
          isQuerySettled &&
          resultItems.length === 0 && (
            <Spotlight.Empty>{t("No results found...")}</Spotlight.Empty>
          )}
        {resultItems}
        {(query.length > 0 || isFilterBrowse) &&
          isFetching &&
          resultItems.length === 0 && (
            <Spotlight.Empty>
              <Text size="sm" style={{ marginTop: 10 }}>
                {t("Searching...")}
              </Text>
            </Spotlight.Empty>
          )}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  );
}
