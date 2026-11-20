import { router, Stack } from 'expo-router';
import { Linking } from 'react-native';
import { Button, Card, Page, Row, Section, T } from '../components/ui';
import { C } from '../theme';

const link = (url: string) => () => Linking.openURL(url);

export default function About() {
  return (
    <Page max={760}>
      <Stack.Screen options={{ title: 'About the data · Upa' }} />
      <T v="h1">About the data</T>
      <T color={C.muted} style={{ marginTop: 4 }}>
        Upa is a portfolio project. It shows what PostgreSQL can do with real Philippine rental data and a demo booking site.
      </T>

      <Section title="Rent and sale prices">
        <Card style={{ gap: 8 }}>
          <T>
            Once a day a small program reads the first four pages of each search on Dot Property (condos, houses, apartments
            and townhouses, for rent and for sale, in 15 cities). It makes one request every three seconds, identifies
            itself, follows the site's robots.txt and stops the moment the site refuses it.
          </T>
          <T>
            Only the facts needed for statistics are kept: type, city, area, bedrooms, bathrooms, floor area and asking price.
            Individual listings are never shown on Upa; every figure is an aggregate, and each one links to the original search.
          </T>
          <T color={C.muted} v="small">
            Asking prices are not final prices. The newest listings are sampled, so large markets are estimates.
          </T>
          <Row><Button small kind="secondary" icon="open-outline" title="dotproperty.com.ph" onPress={link('https://www.dotproperty.com.ph')} /></Row>
        </Card>
      </Section>

      <Section title="Short stays">
        <Card style={{ gap: 8 }}>
          <T>Nightly rates, occupancy and listing counts are copied by hand each month from AirDNA's free market pages.</T>
          <Row><Button small kind="secondary" icon="open-outline" title="AirDNA Philippines" onPress={link('https://www.airdna.co/vacation-rental-data/app/ph')} /></Row>
        </Card>
      </Section>

      <Section title="Price index">
        <Card style={{ gap: 8 }}>
          <T>The Bangko Sentral ng Pilipinas publishes a quarterly Residential Property Price Index from bank housing-loan data. Upa shows the latest year-on-year changes.</T>
          <Row><Button small kind="secondary" icon="open-outline" title="bsp.gov.ph" onPress={link('https://www.bsp.gov.ph')} /></Row>
        </Card>
      </Section>

      <Section title="Stays and hosts">
        <Card style={{ gap: 8 }}>
          <T>Every stay, host, guest and review is made-up demo data. No payments are taken. Demo accounts are shared and reset from time to time.</T>
          <Row gap={8} wrap>
            <Button small kind="teal" title="See how it's built" icon="code-slash" onPress={() => router.push('/under-the-hood')} />
          </Row>
        </Card>
      </Section>
    </Page>
  );
}
